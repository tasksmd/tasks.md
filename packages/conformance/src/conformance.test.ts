import { describe, expect, it } from "vitest";
import { brokenExpectedFailures, brokenTarget } from "./broken.js";
import { referenceTarget } from "./reference.js";
import { checks, runConformance } from "./runner.js";
import { allPassed, failed } from "./types.js";

describe("conformance suite", () => {
  it("the reference target passes every check", async () => {
    const report = await runConformance(referenceTarget);
    const failures = failed(report);
    expect(
      failures,
      `unexpected reference failures: ${JSON.stringify(failures, null, 2)}`,
    ).toEqual([]);
    expect(allPassed(report)).toBe(true);
    // No check should silently skip against the full-capability reference.
    expect(report.results.every((r) => r.status === "pass")).toBe(true);
  });

  it("covers every required property", () => {
    expect(checks.map((c) => c.name).sort()).toEqual(
      [
        "blocked-by-unclaimable",
        "canonical-serialization",
        "claim-fencing",
        "different-task-race",
        "human-command-path",
        "idempotent-projection",
        "lease-expiry-and-steal",
        "path-scoped-enforcement",
        "release-and-reclaim",
        "same-task-race",
        "stale-snapshot",
      ].sort(),
    );
  });

  it("fails the deliberately-broken stub for exactly the expected checks", async () => {
    const report = await runConformance(brokenTarget);
    const actualFailures = failed(report)
      .map((r) => r.name)
      .sort();
    expect(actualFailures).toEqual([...brokenExpectedFailures].sort());
    // The suite must NOT be all-or-nothing: the broken stub still passes the
    // checks its bugs don't touch, proving each check is specific.
    expect(actualFailures.length).toBeGreaterThan(0);
    expect(actualFailures.length).toBeLessThan(checks.length);
  });
});
