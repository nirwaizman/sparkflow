import { describe, it, expect, vi } from "vitest";
import { estimateCost } from "../src/pricing";

describe("estimateCost", () => {
  it("computes USD cost for a known model", () => {
    // gpt-4o-mini: 0.15 in, 0.60 out per 1M tokens
    const cost = estimateCost("openai", "gpt-4o-mini", 1_000_000, 500_000);
    // 1M * 0.15 + 0.5M * 0.60 = 0.15 + 0.30 = 0.45
    expect(cost).toBeCloseTo(0.45, 5);
  });

  it("returns 0 for an unknown provider and does not throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => estimateCost("nope", "whatever", 1000, 1000)).not.toThrow();
    expect(estimateCost("nope", "whatever", 1000, 1000)).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns 0 for an unknown model within a known provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(estimateCost("openai", "imaginary-model", 1000, 1000)).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
