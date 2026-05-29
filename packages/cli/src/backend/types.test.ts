import { describe, expect, it } from "vitest";
import { PRIORITY_RANK, sortByPriority } from "./types.js";

describe("sortByPriority", () => {
  it("orders P0 before P1 before P2 before P3", () => {
    const sorted = sortByPriority([
      { priority: "P3", id: "d" },
      { priority: "P1", id: "b" },
      { priority: "P0", id: "a" },
      { priority: "P2", id: "c" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("is stable for equal priorities (preserves input order)", () => {
    const sorted = sortByPriority([
      { priority: "P1", id: "first" },
      { priority: "P1", id: "second" },
      { priority: "P0", id: "top" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["top", "first", "second"]);
  });

  it("treats an unknown priority as P2", () => {
    const sorted = sortByPriority([
      { priority: "P3", id: "low" },
      { priority: "weird", id: "mid" },
      { priority: "P0", id: "high" },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["high", "mid", "low"]);
  });

  it("PRIORITY_RANK maps P0..P3 to 0..3", () => {
    expect([PRIORITY_RANK.P0, PRIORITY_RANK.P1, PRIORITY_RANK.P2, PRIORITY_RANK.P3]).toEqual([0, 1, 2, 3]);
  });
});
