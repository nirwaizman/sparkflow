/**
 * Browser automation runner.
 *
 * Given a validated `Action[]` plan, drive a Playwright Chromium session
 * (either local or via Browserbase's CDP endpoint) and yield
 * `BrowserEvent` values for the SSE endpoint to forward.
 *
 * Playwright is dynamically imported so this module is safe to reference
 * from code that might be analyzed at build-time or loaded in edge
 * runtimes — the actual `chromium` import only happens inside
 * `runBrowserPlan`, which is itself only called from a `runtime = "nodejs"`
 * route.
 *
 * Screenshots are captured after each action, JPEG-encoded, and
 * opportunistically downscaled until they fit under ~200 KB as data URLs
 * (so they can be streamed through SSE without chunking).
 */
import type { Action, BrowserEvent, RunnerOptions } from "./types";

// Narrow structural shapes for the Playwright types we use. We avoid
// `import type` from "playwright" at module scope so this file can
// compile in environments where the dep hasn't been installed yet (the
// runner is gated behind a runtime check regardless).
type PwBrowser = {
  newContext: (opts?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
  }) => Promise<PwContext>;
  close: () => Promise<void>;
};
type PwContext = {
  newPage: () => Promise<PwPage>;
  close: () => Promise<void>;
};
type PwPage = {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  fill: (selector: string, text: string, opts?: { timeout?: number }) => Promise<void>;
  click: (selector: string, opts?: { timeout?: number }) => Promise<void>;
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  keyboard: { press: (key: string) => Promise<void> };
  url: () => string;
  title: () => Promise<string>;
  content: () => Promise<string>;
  innerText: (selector: string, opts?: { timeout?: number }) => Promise<string>;
  screenshot: (opts?: {
    type?: "jpeg" | "png";
    quality?: number;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
  }) => Promise<Buffer>;
};

const MAX_SCREENSHOT_BYTES = 200 * 1024;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

// -----------------------------------------------------------------------
// Browserbase session helper.
//
// Browserbase exposes a REST API at api.browserbase.com that returns a
// `connectUrl` CDP endpoint usable by `chromium.connectOverCDP`. We keep
// the integration contained to this function so a future SDK swap is a
// one-line change.
// -----------------------------------------------------------------------
async function createBrowserbaseSession(): Promise<{ connectUrl: string; sessionId: string }> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey) throw new Error("BROWSERBASE_API_KEY is not set");
  if (!projectId) throw new Error("BROWSERBASE_PROJECT_ID is not set");

  const res = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: {
      "x-bb-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Browserbase session create failed: ${res.status} ${detail}`);
  }
  const body = (await res.json()) as { id: string; connectUrl?: string };
  const connectUrl = body.connectUrl ?? `wss://connect.browserbase.com?apiKey=${apiKey}&sessionId=${body.id}`;
  return { connectUrl, sessionId: body.id };
}

// -----------------------------------------------------------------------
// Screenshot → compressed data URL.
// -----------------------------------------------------------------------
async function captureCompressedScreenshot(page: PwPage): Promise<string> {
  // Start at quality 70, fullPage=false (viewport only — fullPage produces
  // images large enough to blow past our 200 KB budget on long pages).
  let quality = 70;
  for (let attempt = 0; attempt < 4; attempt++) {
    const buf = await page.screenshot({ type: "jpeg", quality, fullPage: false });
    const b64 = buf.toString("base64");
    // `"data:image/jpeg;base64,".length === 23`. We compare raw bytes, not
    // base64 length, to keep the budget intuitive.
    if (buf.length <= MAX_SCREENSHOT_BYTES || quality <= 25) {
      return `data:image/jpeg;base64,${b64}`;
    }
    quality = Math.max(25, quality - 15);
  }
  // Fallback — shouldn't reach here because of the quality<=25 guard.
  const buf = await page.screenshot({ type: "jpeg", quality: 25, fullPage: false });
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// -----------------------------------------------------------------------
// Action executor.
// -----------------------------------------------------------------------
async function executeAction(
  page: PwPage,
  action: Action,
): Promise<{ extracted?: unknown }> {
  switch (action.type) {
    case "goto":
      await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return {};
    case "type":
      await page.fill(action.selector, action.text, { timeout: 15_000 });
      if (action.submit) await page.keyboard.press("Enter");
      return {};
    case "click":
      await page.click(action.selector, { timeout: 15_000 });
      return {};
    case "wait":
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: 15_000 });
      } else {
        await page.waitForTimeout(Math.min(action.ms ?? 1000, 10_000));
      }
      return {};
    case "extract": {
      // Best-effort text grab. The calling route runs the result through
      // the LLM one more time to shape it per the user's extraction
      // instruction; here we just collect raw material.
      const url = page.url();
      const title = await page.title().catch(() => "");
      let text = "";
      if (action.selector) {
        try {
          text = await page.innerText(action.selector, { timeout: 5_000 });
        } catch {
          text = await page.innerText("body", { timeout: 5_000 }).catch(() => "");
        }
      } else {
        text = await page.innerText("body", { timeout: 5_000 }).catch(() => "");
      }
      // Cap text so we don't balloon the SSE stream.
      const MAX_TEXT = 8_000;
      if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "…";
      return {
        extracted: {
          instruction: action.instruction,
          url,
          title,
          text,
        },
      };
    }
  }
}

// -----------------------------------------------------------------------
// Public API.
// -----------------------------------------------------------------------

export async function* runBrowserPlan(
  actions: Action[],
  opts: RunnerOptions = {},
): AsyncGenerator<BrowserEvent> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const viewport = {
    width: opts.viewportWidth ?? DEFAULT_VIEWPORT.width,
    height: opts.viewportHeight ?? DEFAULT_VIEWPORT.height,
  };
  const useRemote =
    opts.remote ?? Boolean(process.env.BROWSERBASE_API_KEY);

  // Dynamic import keeps Playwright out of the edge bundle and lets the
  // route import this file without pulling the dep at build time.
  //
  // We use a variable specifier so TypeScript doesn't try to resolve
  // `playwright`'s types at compile time — the package may not be
  // installed in every environment that typechecks this file.
  const specifier: string = "playwright";
  const pwMod = (await (Function("s", "return import(s)") as (
    s: string,
  ) => Promise<unknown>)(specifier)) as {
    chromium: {
      launch: (opts?: { headless?: boolean }) => Promise<PwBrowser>;
      connectOverCDP: (url: string) => Promise<PwBrowser>;
    };
  };
  const { chromium } = pwMod;

  let browser: PwBrowser | null = null;
  let context: PwContext | null = null;
  let page: PwPage | null = null;

  const deadline = Date.now() + timeoutMs;
  const extractedResults: unknown[] = [];

  try {
    if (useRemote) {
      const { connectUrl } = await createBrowserbaseSession();
      browser = await chromium.connectOverCDP(connectUrl);
    } else {
      browser = await chromium.launch({ headless: true });
    }
    context = await browser.newContext({
      viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 SparkFlowBot/1.0",
    });
    page = await context.newPage();

    for (let i = 0; i < actions.length; i++) {
      if (Date.now() > deadline) {
        yield {
          kind: "finish",
          ok: false,
          error: `Timed out after ${timeoutMs}ms`,
          result: extractedResults,
        };
        return;
      }
      const action = actions[i]!;
      yield { kind: "action_start", index: i, action };

      let extracted: unknown;
      let ok = true;
      let errMsg: string | undefined;
      try {
        const res = await executeAction(page, action);
        extracted = res.extracted;
        if (extracted !== undefined) extractedResults.push(extracted);
      } catch (e) {
        ok = false;
        errMsg = e instanceof Error ? e.message : String(e);
      }

      // Take a screenshot even on failure — it's usually the most useful
      // debugging artifact.
      try {
        const img = await captureCompressedScreenshot(page);
        yield { kind: "screenshot", image: img, actionIndex: i };
      } catch {
        // Screenshots are best-effort; don't poison the run on failure.
      }

      yield {
        kind: "action_end",
        index: i,
        action,
        ok,
        error: errMsg,
        extracted,
      };

      // Abort early on hard failure.
      if (!ok) {
        yield {
          kind: "finish",
          ok: false,
          error: errMsg,
          result: extractedResults,
        };
        return;
      }
    }

    yield { kind: "finish", ok: true, result: extractedResults };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield { kind: "finish", ok: false, error: msg, result: extractedResults };
  } finally {
    // Teardown in reverse order; swallow errors — we've already emitted
    // the terminal `finish` event.
    try {
      await context?.close();
    } catch {
      /* noop */
    }
    try {
      await browser?.close();
    } catch {
      /* noop */
    }
  }
}
