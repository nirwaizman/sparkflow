import { describe, it, expect } from "vitest";
import { heuristicRoute } from "../src/router";

describe("heuristicRoute", () => {
  it("picks research for an English research keyword", () => {
    const d = heuristicRoute("Please do a deep dive research report on climate trends");
    expect(d.mode).toBe("research");
    expect(d.complexity).toBe("high");
  });

  it("picks search for an English freshness keyword", () => {
    const d = heuristicRoute("What is the latest news on AI hardware prices?");
    expect(d.mode).toBe("search");
  });

  it("picks research for a Hebrew research keyword", () => {
    const d = heuristicRoute("אני צריך מחקר מעמיק על כלכלת ישראל");
    expect(d.mode).toBe("research");
  });

  it("picks search for a Hebrew freshness keyword", () => {
    const d = heuristicRoute("מה המחיר של ביטקוין היום?");
    expect(d.mode).toBe("search");
  });

  it("defaults to chat when no keywords match", () => {
    const d = heuristicRoute("hello, can you help me brainstorm a name?");
    expect(d.mode).toBe("chat");
  });
});
