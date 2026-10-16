// US07 Monitor queue health at a glance: stats and list as JSON.
// Story: docs/user-stories/07-monitor-queue-health.md
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanup, scratchRepo, tasks, tasksMd } from "./helpers.mjs";

test("US07 happy: stats counts tasks by priority, blocked, and claimed", () => {
  const dir = scratchRepo({
    "TASKS.md": tasksMd({
      P0: [["- [ ] Hotfix (@alice)", "  - **ID**: hotfix"]],
      P1: [["- [ ] Feature", "  - **ID**: feature", "  - **Blocked by**: hotfix"]],
      P2: [["- [ ] Cleanup", "  - **ID**: cleanup"]],
    }),
  });
  try {
    const result = tasks(["stats", "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    const stats = JSON.parse(result.stdout);
    assert.equal(stats.total, 3);
    assert.deepEqual(stats.byPriority, { P0: 1, P1: 1, P2: 1, P3: 0 });
    assert.equal(stats.blocked, 1);
    assert.equal(stats.claimed, 1);
    assert.equal(stats.available, 1);
  } finally {
    cleanup(dir);
  }
});

test("US07 error: an empty repo reports zero tasks instead of failing", () => {
  const dir = scratchRepo();
  try {
    const result = tasks(["stats", "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).total, 0);
  } finally {
    cleanup(dir);
  }
});
