import { describe, expect, it } from "vitest";
import { SessionMemory } from "../src/index";

describe("SessionMemory", () => {
  it("gets and sets values scoped to a conversation", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "draft", "hello world");
    expect(mem.get("conv-1", "draft")).toBe("hello world");
    expect(mem.get("conv-2", "draft")).toBeUndefined();
  });

  it("overwrites on set", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "k", "first");
    mem.set("conv-1", "k", "second");
    expect(mem.get("conv-1", "k")).toBe("second");
  });

  it("all() returns every key for a conversation", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "a", "1");
    mem.set("conv-1", "b", "2");
    mem.set("conv-2", "a", "other");

    expect(mem.all("conv-1")).toEqual({ a: "1", b: "2" });
    expect(mem.all("conv-2")).toEqual({ a: "other" });
    expect(mem.all("conv-3")).toEqual({});
  });

  it("delete drops only the specified entry", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "a", "1");
    mem.set("conv-1", "b", "2");
    expect(mem.delete("conv-1", "a")).toBe(true);
    expect(mem.get("conv-1", "a")).toBeUndefined();
    expect(mem.get("conv-1", "b")).toBe("2");
  });

  it("clear with a conversationId wipes only that conversation", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "a", "1");
    mem.set("conv-2", "a", "2");
    mem.clear("conv-1");
    expect(mem.all("conv-1")).toEqual({});
    expect(mem.all("conv-2")).toEqual({ a: "2" });
  });

  it("clear with no argument wipes everything", () => {
    const mem = new SessionMemory();
    mem.set("conv-1", "a", "1");
    mem.set("conv-2", "b", "2");
    mem.clear();
    expect(mem.all("conv-1")).toEqual({});
    expect(mem.all("conv-2")).toEqual({});
  });
});
