import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor, runFleetInit } from "./fleet.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-fleet-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runFleetInit", () => {
  it("writes config, lefthook, and the projection workflow on a fresh repo", () => {
    const result = runFleetInit(dir);
    expect(existsSync(join(dir, ".tasksmd.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, ".tasksmd.json"), "utf-8")).backend).toBe("git-native");
    expect(existsSync(join(dir, "lefthook.yml"))).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows", "tasks-snapshot.yml"))).toBe(true);
    expect(result.wrote.length).toBeGreaterThan(0);
    // Ruleset guidance is delegated to existing tools, not a bespoke manager.
    expect(result.lines.join("\n")).toMatch(/gh api|Terraform|Probot/);
  });

  it("is idempotent — a second run clobbers nothing", () => {
    runFleetInit(dir);
    const second = runFleetInit(dir);
    expect(second.wrote).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it("does not clobber an existing .tasksmd.json", () => {
    writeFileSync(join(dir, ".tasksmd.json"), JSON.stringify({ backend: "tasks-md" }));
    runFleetInit(dir);
    expect(JSON.parse(readFileSync(join(dir, ".tasksmd.json"), "utf-8")).backend).toBe("tasks-md");
  });
});

describe("runDoctor", () => {
  it("reports ok after fleet init", async () => {
    runFleetInit(dir);
    const report = await runDoctor(dir);
    expect(report.ok).toBe(true);
    const names = report.checks.map((c) => c.name);
    expect(names).toContain("backend config");
    expect(names).toContain("lefthook");
    expect(names).toContain("projection workflow");
  });

  it("warns (not fails) on an uninitialized repo", async () => {
    const report = await runDoctor(dir);
    expect(report.ok).toBe(true); // warnings only, no hard failures
    expect(report.checks.some((c) => c.level === "warn")).toBe(true);
  });
});
