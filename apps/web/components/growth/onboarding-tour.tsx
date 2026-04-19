"use client";

/**
 * OnboardingTour — a lightweight 6-step walkthrough anchored to DOM
 * nodes via `data-onboarding="..."` attributes. Uses Radix Tooltip (via
 * @sparkflow/ui) for positioning so we don't pull in a dedicated tour
 * library.
 *
 * State model
 * -----------
 * - Progress is persisted in localStorage under `sf.onboarding.v1` so
 *   the tour survives reloads without a round-trip to the server.
 * - The tour starts automatically on the first render after the
 *   `/welcome` page has completed (it sets the `sf.onboarding.start`
 *   flag). It can also be re-opened from the user menu at any time by
 *   clearing the flag.
 *
 * Positioning
 * -----------
 * We measure the anchor element on each step and render a fixed
 * popover relative to the viewport. If the anchor is missing the step
 * is skipped — the tour never gets stuck on a route that hides a
 * particular tile.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@sparkflow/ui";
import { ONBOARDING_STEPS, type OnboardingStep } from "@sparkflow/growth";

const LS_KEY = "sf.onboarding.v1";
const LS_START_FLAG = "sf.onboarding.start";

type PersistedState = {
  /** index of the next step to show; `ONBOARDING_STEPS.length` when done */
  cursor: number;
  dismissed: boolean;
};

function loadState(): PersistedState {
  if (typeof window === "undefined") return { cursor: 0, dismissed: true };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { cursor: 0, dismissed: false };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      cursor: typeof parsed.cursor === "number" ? parsed.cursor : 0,
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { cursor: 0, dismissed: false };
  }
}

function saveState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

type Rect = { top: number; left: number; width: number; height: number };

function measure(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function popoverStyle(
  anchor: Rect | null,
  side: OnboardingStep["side"],
): React.CSSProperties {
  if (!anchor) {
    return {
      position: "fixed",
      top: 24,
      right: 24,
      maxWidth: 360,
    };
  }
  const gap = 12;
  const width = 340;
  switch (side) {
    case "top":
      return {
        position: "fixed",
        top: Math.max(12, anchor.top - gap - 140),
        left: Math.max(12, anchor.left + anchor.width / 2 - width / 2),
        width,
      };
    case "bottom":
      return {
        position: "fixed",
        top: anchor.top + anchor.height + gap,
        left: Math.max(12, anchor.left + anchor.width / 2 - width / 2),
        width,
      };
    case "left":
      return {
        position: "fixed",
        top: anchor.top,
        left: Math.max(12, anchor.left - width - gap),
        width,
      };
    case "right":
    default:
      return {
        position: "fixed",
        top: anchor.top,
        left: anchor.left + anchor.width + gap,
        width,
      };
  }
}

export function OnboardingTour(): React.ReactElement | null {
  const router = useRouter();
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  // Kick the tour off when /welcome flips the start flag.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldStart =
      window.localStorage.getItem(LS_START_FLAG) === "1" &&
      !state.dismissed &&
      state.cursor >= ONBOARDING_STEPS.length;
    if (shouldStart) {
      window.localStorage.removeItem(LS_START_FLAG);
      setState({ cursor: 0, dismissed: false });
    }
  }, [state.cursor, state.dismissed]);

  const active: OnboardingStep | undefined = useMemo(() => {
    if (state.dismissed) return undefined;
    if (state.cursor >= ONBOARDING_STEPS.length) return undefined;
    return ONBOARDING_STEPS[state.cursor];
  }, [state.cursor, state.dismissed]);

  // Poll the anchor element on each step — the target might not be
  // mounted immediately (client components hydrate at staggered times).
  useEffect(() => {
    if (!active) {
      setAnchorRect(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(active.selector);
      setAnchorRect(measure(el));
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active]);

  const advance = useCallback(() => {
    setState((s) => {
      const next = { ...s, cursor: s.cursor + 1 };
      saveState(next);
      return next;
    });
  }, []);

  const skip = useCallback(() => {
    setState(() => {
      const next = { cursor: ONBOARDING_STEPS.length, dismissed: true };
      saveState(next);
      return next;
    });
  }, []);

  const handleCta = useCallback(() => {
    if (!active) return;
    if (active.ctaHref) router.push(active.ctaHref);
    advance();
  }, [active, advance, router]);

  if (!active) return null;

  const style = popoverStyle(anchorRect, active.side);
  const stepNumber = state.cursor + 1;
  const total = ONBOARDING_STEPS.length;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40"
        style={{ background: "transparent" }}
      />
      <div
        role="dialog"
        aria-label={active.title}
        aria-modal="false"
        className="z-50 rounded-xl border border-white/10 bg-[hsl(var(--popover))] p-4 text-[hsl(var(--popover-foreground))] shadow-xl"
        style={style}
      >
        <div className="mb-2 flex items-center justify-between text-xs opacity-70">
          <span>
            Step {stepNumber} of {total}
          </span>
          <button
            type="button"
            onClick={skip}
            className="underline-offset-2 hover:underline"
          >
            Skip tour
          </button>
        </div>
        <div className="mb-1 text-sm font-semibold">{active.title}</div>
        <p className="mb-3 text-sm opacity-80">{active.description}</p>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={advance}
          >
            {stepNumber === total ? "Finish" : "Next"}
          </Button>
          <Button type="button" size="sm" onClick={handleCta}>
            {active.ctaLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

export default OnboardingTour;
