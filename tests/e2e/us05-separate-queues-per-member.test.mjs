// US05 Each team member has their own queue: per-directory TASKS.md files.
// Story: docs/user-stories/05-separate-queues-per-member.md
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanup, scratchRepo, tasks, tasksLint, tasksMd } from "./helpers.mjs";

test("US05 happy: list finds tasks in every package queue", () => {
  const dir = scratchRepo({
    "packages/api/TASKS.md": tasksMd({ P1: [["- [ ] Api task", "  - **ID**: api-task"]] }),
    "packages/web/TASKS.md": tasksMd({ P2: [["- [ ] Web task", "  - **ID**: web-task", "  - **Tags**: ui"]] }),
  });
  try {
    const result = tasks(["list", "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    const ids = JSON.parse(result.stdout).map((t) => t.id).sort();
    assert.deepEqual(ids, ["api-task", "web-task"]);
    const ui = JSON.parse(tasks(["list", "--tag", "ui", "--json"], { cwd: dir }).stdout);
    assert.deepEqual(ui.map((t) => t.id), ["web-task"]);
  } finally {
    cleanup(dir);
  }
});

test("US05 error: the same ID in two queues fails the lint and names both files", () => {
  const dir = scratchRepo({
    "packages/api/TASKS.md": tasksMd({ P1: [["- [ ] Api task", "  - **ID**: shared"]] }),
    "packages/web/TASKS.md": tasksMd({ P2: [["- [ ] Web task", "  - **ID**: shared"]] }),
  });
  try {
    const result = tasksLint(["packages/"], { cwd: dir });
    assert.equal(result.code, 1);
    assert.match(result.stdout + result.stderr, /duplicate ID 'shared'.*packages\/api\/TASKS\.md/s);
  } finally {
    cleanup(dir);
  }
});
