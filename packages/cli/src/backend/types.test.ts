import { describe, expect, it } from "vitest";
import {
  formatClaimResult,
  PRIORITY_RANK,
  sortByPriority,
  type BackendCapabilities,
  type ClaimTaskResult,
} from "./types.js";

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

describe("claim results", () => {
  it("formats collision-free claims with their fencing token", () => {
    const capabilities: BackendCapabilities = {
      claims: "collision-free",
      sourceOfTruth: "log",
      generatedSnapshot: true,
    };
    const result: ClaimTaskResult = {
      status: "claimed",
      backend: "git-native",
      taskId: "ship-fleet-claims",
      claimId: "claim-123",
      owner: "devin",
      capabilities,
    };

    expect(formatClaimResult(result)).toBe(
      "Claimed ship-fleet-claims for devin with claim claim-123.",
    );
  });

  it("formats best-effort file claims without pretending they are fenced", () => {
    const result: ClaimTaskResult = {
      status: "claimed",
      backend: "TASKS.md",
      taskId: "local-task",
      owner: "devin",
      capabilities: {
        claims: "best-effort",
        sourceOfTruth: "tasks-md",
        generatedSnapshot: false,
      },
    };

    expect(formatClaimResult(result)).toBe(
      "Claimed local-task for devin using best-effort TASKS.md claims.",
    );
  });
});
