import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkCommandCommitTypes, prescribedSubjects } from "./check-command-commit-types.mjs";

test("finds subjects in git commit -m and in backtick spans on commit lines", () => {
  const text = [
    'git commit -m "docs: plan for <task-id>"',
    "Commit it as `chore: block <id>` and push.",
    "4. Commit: `plan: decompose <id>`",
  ].join("\n");
  assert.deepEqual(
    prescribedSubjects(text).map((s) => s.type),
    ["docs", "chore", "plan"],
  );
});

test("ignores placeholders and backtick spans on lines that are not about commits", () => {
  const text = [
    'git commit -m "<type>: <description>"',
    "writes `.tasksmd.json` (`backend: git-native`)",
  ].join("\n");
  assert.deepEqual(prescribedSubjects(text), []);
});

test("accepts scopes and breaking-change markers on standard types", () => {
  const text = "Commit with `chore(tasks): review queue` or `feat!: drop flag`.";
  assert.deepEqual(prescribedSubjects(text).map((s) => s.type), ["chore", "feat"]);
});

test("flags a non-standard type in a canonical command file", () => {
  const root = mkdtempSync(join(tmpdir(), "commit-types-"));
  try {
    mkdirSync(join(root, "commands"));
    writeFileSync(join(root, "commands", "ok.md"), 'git commit -m "fix: x"\n');
    writeFileSync(join(root, "commands", "bad.md"), "line\nCommit: `plan: decompose x`\n");
    const errors = checkCommandCommitTypes(root);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /commands\/bad\.md:2: .*"plan"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("this repo's command sources prescribe only standard types", () => {
  assert.deepEqual(checkCommandCommitTypes(fileURLToPath(new URL("..", import.meta.url))), []);
});
