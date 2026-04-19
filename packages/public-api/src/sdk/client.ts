/**
 * `@sparkflow/public-api/sdk` — tiny TypeScript client for the v1
 * public API. Designed to be usable from Node.js (>= 18) and modern
 * browsers out of the box; no runtime dependencies.
 *
 * Example:
 *   const sf = new SparkFlow({ apiKey: "sf_live_..." });
 *   const res = await sf.chat.create({ messages: [{ role: "user", content: "hi" }] });
 *
 * Each namespace (chat, image, docs, ...) just wraps a POST against the
 * corresponding `/v1/...` route. We keep the shapes intentionally loose
 * (`Record<string, unknown>`) so the SDK stays stable even as the
 * server-side schemas evolve — the OpenAPI document is the source of
 * truth for fine-grained typing.
 */

export interface SparkFlowOptions {
  apiKey: string;
  /** Defaults to `https://api.sparkflow.ai`. */
  baseUrl?: string;
  /** Optional fetch implementation (tests, Deno, etc). */
  fetch?: typeof fetch;
  /** Optional request timeout in ms. */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatCreateInput {
  messages: ChatMessage[];
  forceSearch?: boolean;
  conversationId?: string;
}

export interface ImageGenerateInput {
  prompt: string;
  size?: string;
  n?: number;
  negativePrompt?: string;
  provider?: "openai" | "replicate" | "google";
  quality?: "low" | "medium" | "high";
}

export interface DocsGenerateInput {
  prompt: string;
  title?: string;
  style?: string;
}

export interface SlidesGenerateInput {
  prompt: string;
  slideCount?: number;
  theme?: string;
}

export interface SheetsGenerateInput {
  prompt: string;
  columns?: string[];
  rows?: number;
}

export interface AgentRunInput {
  agentId?: string;
  goal: string;
  context?: Record<string, unknown>;
}

export interface TaskCreateInput {
  goal: string;
  context?: Record<string, unknown>;
}

export interface WorkflowRunInput {
  workflowId: string;
  input?: Record<string, unknown>;
}

export interface WebhookCreateInput {
  url: string;
  events: string[];
  secret?: string;
}

const DEFAULT_BASE_URL = "https://api.sparkflow.ai";

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "SparkFlowApiError";
    this.status = status;
    this.body = body;
  }
}

export class SparkFlow {
  readonly chat: ChatNamespace;
  readonly image: ImageNamespace;
  readonly docs: DocsNamespace;
  readonly slides: SlidesNamespace;
  readonly sheets: SheetsNamespace;
  readonly agents: AgentsNamespace;
  readonly tasks: TasksNamespace;
  readonly workflows: WorkflowsNamespace;
  readonly webhooks: WebhooksNamespace;

  private readonly opts: Required<Pick<SparkFlowOptions, "apiKey">> &
    Pick<SparkFlowOptions, "baseUrl" | "fetch" | "timeoutMs">;

  constructor(options: SparkFlowOptions) {
    if (!options?.apiKey) {
      throw new Error("SparkFlow: apiKey is required");
    }
    this.opts = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? 60_000,
    };
    this.chat = new ChatNamespace(this);
    this.image = new ImageNamespace(this);
    this.docs = new DocsNamespace(this);
    this.slides = new SlidesNamespace(this);
    this.sheets = new SheetsNamespace(this);
    this.agents = new AgentsNamespace(this);
    this.tasks = new TasksNamespace(this);
    this.workflows = new WorkflowsNamespace(this);
    this.webhooks = new WebhooksNamespace(this);
  }

  /** @internal */
  async request<T = unknown>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const fetchImpl = this.opts.fetch ?? (globalThis.fetch as typeof fetch);
    if (!fetchImpl) {
      throw new Error("SparkFlow: no fetch implementation available");
    }
    const url = `${this.opts.baseUrl!.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timeout =
      this.opts.timeoutMs && this.opts.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.opts.timeoutMs)
        : null;
    try {
      const res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const parsed: unknown = text ? safeJson(text) : null;
      if (!res.ok) {
        throw new ApiError(
          res.status,
          `SparkFlow ${method} ${path} failed: ${res.status}`,
          parsed,
        );
      }
      return parsed as T;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class ChatNamespace {
  constructor(private readonly client: SparkFlow) {}
  create(input: ChatCreateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/chat", input);
  }
}

class ImageNamespace {
  constructor(private readonly client: SparkFlow) {}
  generate(input: ImageGenerateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/image/generate", input);
  }
}

class DocsNamespace {
  constructor(private readonly client: SparkFlow) {}
  generate(input: DocsGenerateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/docs/generate", input);
  }
}

class SlidesNamespace {
  constructor(private readonly client: SparkFlow) {}
  generate(input: SlidesGenerateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/slides/generate", input);
  }
}

class SheetsNamespace {
  constructor(private readonly client: SparkFlow) {}
  generate(input: SheetsGenerateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/sheets/generate", input);
  }
}

class AgentsNamespace {
  constructor(private readonly client: SparkFlow) {}
  run(input: AgentRunInput): Promise<unknown> {
    return this.client.request("POST", "/v1/agents/run", input);
  }
}

class TasksNamespace {
  constructor(private readonly client: SparkFlow) {}
  create(input: TaskCreateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/tasks", input);
  }
  list(): Promise<unknown> {
    return this.client.request("GET", "/v1/tasks");
  }
}

class WorkflowsNamespace {
  constructor(private readonly client: SparkFlow) {}
  run(input: WorkflowRunInput): Promise<unknown> {
    return this.client.request("POST", "/v1/workflows/run", input);
  }
}

class WebhooksNamespace {
  constructor(private readonly client: SparkFlow) {}
  create(input: WebhookCreateInput): Promise<unknown> {
    return this.client.request("POST", "/v1/webhooks", input);
  }
  list(): Promise<unknown> {
    return this.client.request("GET", "/v1/webhooks");
  }
}
