import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectReleases, groupSubjects, renderChangelog, renderSection } from "./changelog.mjs";

test("groups user-facing commit types and drops the rest", () => {
  const { groups, breaking } = groupSubjects([
    "feat(cli): add list --json (#16)",
    "fix: restore claims backlog (#2)",
    "docs: tidy the README (#4)",
    "chore: bump packages (#3)",
    "not a conventional subject",
  ]);
  assert.deepEqual(groups.get("feat"), ["feat(cli): add list --json (#16)"]);
  assert.deepEqual(groups.get("fix"), ["fix: restore claims backlog (#2)"]);
  assert.deepEqual(breaking, []);
});

test("lists breaking changes first", () => {
  const section = renderSection("1.0.0", "2026-10-16", ["feat!: drop Node 16", "fix: a bug"], false);
  assert.match(section, /^## 1\.0\.0 — 2026-10-16\n\n### Breaking changes\n\n- feat!: drop Node 16\n/);
  assert.match(section, /### Fixes\n\n- fix: a bug/);
});

test("a release with only chores says so", () => {
  assert.match(renderSection("0.2.0", "2026-10-16", ["chore: x"], false), /- No user-facing changes\./);
  assert.match(renderSection("0.1.0", "2026-10-01", ["chore: initial"], true), /- First release from this repository\./);
});

test("the changelog lists releases newest first and ends with one newline", () => {
  const text = renderChangelog([
    { version: "0.2.0", date: "2026-10-16", subjects: ["feat: b"] },
    { version: "0.1.0", date: "2026-10-01", subjects: ["chore: a"] },
  ]);
  assert.ok(text.startsWith("# Changelog\n"));
  assert.ok(text.indexOf("## 0.2.0") < text.indexOf("## 0.1.0"));
  assert.ok(text.endsWith("repository.\n"));
});

test("a release whose tag exists is not listed twice", () => {
  const dir = mkdtempSync(join(tmpdir(), "tasksmd-changelog-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, env });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "feat: a");
  git("tag", "v0.1.0");
  git("commit", "-q", "--allow-empty", "-m", "fix: b");
  assert.deepEqual(collectReleases(dir, "0.1.0", "2026-10-16").map((r) => r.version), ["0.1.0"]);
  const next = collectReleases(dir, "0.2.0", "2026-10-16");
  assert.deepEqual(next.map((r) => r.version), ["0.2.0", "0.1.0"]);
  assert.deepEqual(next[0].subjects, ["fix: b"]);
});
