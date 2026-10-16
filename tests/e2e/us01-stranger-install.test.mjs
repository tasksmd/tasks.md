// US01 Agents know what to work on: a stranger installs the CLI and gets a valid queue.
// Story: docs/user-stories/01-agents-know-what-to-work-on.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, packed, repoRoot, scratchRepo, tasks, tasksLint } from "./helpers.mjs";

test("US01 happy: init in an empty repo gives a valid TASKS.md and a passing doctor", () => {
  if (packed) assert.ok(!process.env.TASKS_E2E_BIN.startsWith(repoRoot), "the CLI must come from the packed install, not this checkout");
  const dir = scratchRepo();
  try {
    const init = tasks(["init"], { cwd: dir });
    assert.equal(init.code, 0, init.stderr);
    assert.ok(existsSync(join(dir, "TASKS.md")));
    assert.match(readFileSync(join(dir, "AGENTS.md"), "utf-8"), /## Task Management/);
    assert.equal(tasksLint(["TASKS.md"], { cwd: dir }).code, 0);
    const doctor = tasks(["doctor"], { cwd: dir });
    assert.equal(doctor.code, 0, doctor.stdout);
    assert.match(doctor.stdout, /backend config/);
  } finally {
    cleanup(dir);
  }
});

test("US01 error: the linter rejects a task outside a priority section and names the line", () => {
  const dir = scratchRepo();
  try {
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n- [ ] Orphan task\n\n## P1\n");
    const lint = tasksLint(["TASKS.md"], { cwd: dir });
    assert.equal(lint.code, 1);
    assert.match(lint.stdout + lint.stderr, /ERROR: .*TASKS\.md:3/);
  } finally {
    cleanup(dir);
  }
});
