import { describe, it, expect } from "vitest";
import { ENTITLEMENTS } from "../src/catalog";

const NUMERIC_FEATURES = [
  "messagesPerDay",
  "filesTotal",
  "maxFileMb",
  "agentsActive",
  "workflowsActive",
  "monthlyCostCapUsd",
] as const;

const ORDER = ["free", "pro", "team", "enterprise"] as const;

describe("entitlements catalog", () => {
  it("defines all 4 tiers", () => {
    expect(Object.keys(ENTITLEMENTS).sort()).toEqual(
      ["enterprise", "free", "pro", "team"].sort(),
    );
  });

  it("every numeric feature increases monotonically free < pro < team < enterprise", () => {
    for (const feature of NUMERIC_FEATURES) {
      const values = ORDER.map((t) => ENTITLEMENTS[t][feature] as number);
      for (let i = 1; i < values.length; i++) {
        const prev = values[i - 1]!;
        const cur = values[i]!;
        expect(
          cur >= prev,
          `feature ${feature}: ${ORDER[i]}=${cur} should be >= ${ORDER[i - 1]}=${prev}`,
        ).toBe(true);
      }
      // Strict increase from free → pro for every gated numeric feature
      // (free=0 for workflows and cost cap is allowed; we want pro > free).
      expect(values[1]! > values[0]!).toBe(true);
    }
  });

  it("enterprise has Infinity for core quota dimensions", () => {
    expect(ENTITLEMENTS.enterprise.messagesPerDay).toBe(Infinity);
    expect(ENTITLEMENTS.enterprise.filesTotal).toBe(Infinity);
    expect(ENTITLEMENTS.enterprise.agentsActive).toBe(Infinity);
    expect(ENTITLEMENTS.enterprise.workflowsActive).toBe(Infinity);
    expect(ENTITLEMENTS.enterprise.monthlyCostCapUsd).toBe(Infinity);
  });

  it("webSearch is enabled in every tier", () => {
    for (const t of ORDER) {
      expect(ENTITLEMENTS[t].webSearch).toBe(true);
    }
  });
});
