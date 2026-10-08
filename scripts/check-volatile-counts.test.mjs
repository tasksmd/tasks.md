// Run: node --test scripts/check-volatile-counts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanFiles, scanLines } from "./check-volatile-counts.mjs";

const SCRIPT = fileURLToPath(new URL("./check-volatile-counts.mjs", import.meta.url));

test("flags inventory counts written as digits or number words", () => {
  for (const line of [
    "One spec, six agents (Claude Code, Cursor, Codex), any CI.",
    "auto-detects 6 agents",
    "This is an npm workspace with four packages under `packages/`:",
    "All four npm packages share a single version.",
    "Configured workspaces: tooling (10 repos).",
    "Same six per-agent variants for `/lint-tasks`",
    "The spec lands in 50+ repos.",
    "Publishes all 4 packages to npm",
  ]) {
    assert.equal(scanLines([line]).length, 1, line);
  }
});

test("ignores generic one/two phrasing that is not an inventory", () => {
  for (const line of [
    "A solo developer with one agent benefits from persistent context.",
    "Two agents can race to claim the same task.",
    "If two tools or flags overlap, merge behavior.",
    "Configured workspaces: tooling (<n> repos), work (<n> repos).",
  ]) {
    assert.deepEqual(scanLines([line]), [], line);
  }
});

test("allows sizing thresholds", () => {
  for (const line of [
    "Split the queue at ≥ 50 agents.",
    "Keep it under 20 packages per release.",
    "Supports up to 100 repos per workspace.",
    "Warn when more than 8 agents claim at once.",
    "At least 3 repos must opt in.",
  ]) {
    assert.deepEqual(scanLines([line]), [], line);
  }
});

test("allows fenced code blocks", () => {
  assert.deepEqual(scanLines(["```", "Installed for 6 agents", "```"]), []);
  assert.equal(scanLines(["```", "x", "```", "Installed for 6 agents"]).length, 1);
});

test("allows lines with the allowlist marker", () => {
  assert.deepEqual(
    scanLines(["The v1 release shipped 4 packages. <!-- volatile-count-allowlist: historical fact -->"]),
    [],
  );
});

test("reports line numbers and matched text", () => {
  const [hit] = scanLines(["ok", "ships six agents"]);
  assert.equal(hit.line, 2);
  assert.match(hit.match, /six agents/);
});

test("--self-test exits 0", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--self-test"], { encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
});

test("scans the canonical root docs", () => {
  const files = scanFiles();
  for (const rel of ["README.md", "CONTRIBUTING.md", "AGENTS.md", "ARCHITECTURE.md", "ROADMAP.md", "VISION.md"]) {
    assert.ok(files.includes(rel), rel);
  }
});

test("the repo docs report 0 violations", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
});
