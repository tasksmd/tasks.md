// US10 One-prompt setup: the CLI steps the /setup prompt runs are idempotent and verified.
// Story: docs/user-stories/10-one-prompt-setup.md (prompt: commands/setup.md)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, scratchRepo, tasks, tasksLint } from "./helpers.mjs";

test("US10 happy: the setup steps twice give one section, the agent's command, and a passing doctor", () => {
  const dir = scratchRepo();
  try {
    for (let run = 0; run < 2; run++) {
      assert.equal(tasks(["init"], { cwd: dir }).code, 0);
      assert.equal(tasks(["install", "--agent", "claude"], { cwd: dir }).code, 0);
    }
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf-8");
    assert.equal(agents.match(/## Task Management/g)?.length, 1);
    assert.ok(existsSync(join(dir, ".claude", "skills", "next-task", "SKILL.md")));
    assert.equal(tasksLint(["TASKS.md"], { cwd: dir }).code, 0);
    const doctor = tasks(["init", "--install"], { cwd: dir });
    assert.equal(doctor.code, 0, doctor.stdout);
    assert.match(doctor.stdout, /Verifying with `tasks doctor`/);
    assert.doesNotMatch(doctor.stdout, /✗/);
  } finally {
    cleanup(dir);
  }
});

test("US10 error: setup never overwrites an existing TASKS.md", () => {
  const original = "# Tasks\n\n## P1\n\n- [ ] Keep me\n  - **ID**: keep-me\n";
  const dir = scratchRepo({ "TASKS.md": original });
  try {
    const result = tasks(["init"], { cwd: dir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /TASKS\.md already exists/);
    assert.equal(readFileSync(join(dir, "TASKS.md"), "utf-8"), original);
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n\nHouse rules.\n");
    tasks(["init"], { cwd: dir });
    assert.match(readFileSync(join(dir, "AGENTS.md"), "utf-8"), /House rules\.[\s\S]*## Task Management/);
  } finally {
    cleanup(dir);
  }
});
