import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sparkflow/db before importing the module under test. The mock
// records every `.values(...)` payload so we can assert the insert shape.

const insertedValues: Array<Record<string, unknown>> = [];

vi.mock("@sparkflow/db", () => {
  const usageRecords = { __table: "usage_records" };
  return {
    usageRecords,
    getDb: () => ({
      insert: (_table: unknown) => ({
        values: async (v: Record<string, unknown>) => {
          insertedValues.push(v);
        },
      }),
    }),
  };
});

// Dynamic import AFTER the mock is registered.
const { recordUsage } = await import("../src/meter");

describe("recordUsage", () => {
  beforeEach(() => {
    insertedValues.length = 0;
  });

  it("writes a row with the expected shape", async () => {
    await recordUsage({
      organizationId: "org-123",
      userId: "user-456",
      feature: "chat.message",
      provider: "openai",
      model: "gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.0123,
      latencyMs: 412,
    });

    expect(insertedValues).toHaveLength(1);
    const row = insertedValues[0]!;
    expect(row.organizationId).toBe("org-123");
    expect(row.userId).toBe("user-456");
    expect(row.feature).toBe("chat.message");
    expect(row.provider).toBe("openai");
    expect(row.model).toBe("gpt-4o-mini");
    expect(row.inputTokens).toBe(1000);
    expect(row.outputTokens).toBe(500);
    // costUsd is serialised to a fixed-precision string.
    expect(row.costUsd).toBe("0.012300");
    expect(row.latencyMs).toBe(412);
  });

  it("defaults optional fields to null", async () => {
    await recordUsage({
      organizationId: "org-1",
      feature: "file.upload",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
    const row = insertedValues[0]!;
    expect(row.userId).toBeNull();
    expect(row.provider).toBeNull();
    expect(row.model).toBeNull();
    expect(row.latencyMs).toBeNull();
    expect(row.costUsd).toBe("0.000000");
  });

  it("coerces non-integer token counts to integers", async () => {
    await recordUsage({
      organizationId: "org-1",
      feature: "chat.message",
      inputTokens: 1.9,
      outputTokens: 0.1,
      costUsd: 0,
    });
    const row = insertedValues[0]!;
    expect(row.inputTokens).toBe(1);
    expect(row.outputTokens).toBe(0);
  });
});
