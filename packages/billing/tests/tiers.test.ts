import { describe, it, expect } from "vitest";
import { TIERS, ALL_TIERS, tierFromPriceId } from "../src/tiers";

describe("tier catalog", () => {
  it("defines exactly 4 tiers", () => {
    expect(ALL_TIERS).toHaveLength(4);
    expect(ALL_TIERS).toEqual(["free", "pro", "team", "enterprise"]);
  });

  it("each tier has a display name and features", () => {
    for (const tier of ALL_TIERS) {
      const spec = TIERS[tier];
      expect(spec.displayName).toBeTruthy();
      expect(Array.isArray(spec.features)).toBe(true);
      expect(spec.features.length).toBeGreaterThan(0);
    }
  });

  it("free tier has no Stripe price", () => {
    expect(TIERS.free.stripePriceIdMonthly).toBeNull();
    expect(TIERS.free.stripePriceIdYearly).toBeNull();
    expect(TIERS.free.monthlyPriceUsd).toBe(0);
  });

  it("paid tiers have monotonically increasing monthly price", () => {
    expect(TIERS.pro.monthlyPriceUsd).toBeGreaterThan(TIERS.free.monthlyPriceUsd);
    expect(TIERS.team.monthlyPriceUsd).toBeGreaterThan(TIERS.pro.monthlyPriceUsd);
  });

  it("tierFromPriceId returns null for unknown IDs", () => {
    expect(tierFromPriceId("price_does_not_exist")).toBeNull();
  });
});
