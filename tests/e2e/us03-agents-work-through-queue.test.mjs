// US03 Agents work through the queue: install /next-task for the agent.
// Story: docs/user-stories/03-agents-work-through-queue.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { cleanup, scratchRepo, tasks } from "./helpers.mjs";

test("US03 happy: install auto-detects the agent dir and writes /next-task", () => {
  const dir = scratchRepo();
  try {
    mkdirSync(join(dir, ".claude"));
    const result = tasks(["install"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(existsSync(join(dir, ".claude", "skills", "next-task", "SKILL.md")));
    assert.match(result.stdout, /Installed for 1 agent/);
  } finally {
    cleanup(dir);
  }
});

test("US03 error: with no agent dir, install explains how to proceed and writes nothing", () => {
  const dir = scratchRepo();
  try {
    const result = tasks(["install"], { cwd: dir });
    assert.match(result.stdout, /No agent directories detected/);
    assert.match(result.stdout, /--all/);
    assert.ok(!existsSync(join(dir, ".claude")));
  } finally {
    cleanup(dir);
  }
});
