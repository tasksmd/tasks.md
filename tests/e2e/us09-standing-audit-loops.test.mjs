// US09 Standing audit loops: pick skips standing-loop tasks during normal walks.
// Story: docs/user-stories/09-standing-audit-loops.md
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanup, scratchRepo, tasks, tasksMd } from "./helpers.mjs";

const LOOP = ["- [ ] Refill the queue", "  - **ID**: standing-audit-gap-loop", "  - **Tags**: standing-loop, audit-only"];

test("US09 happy: a P0 standing loop does not shadow normal P2 work", () => {
  const dir = scratchRepo({ "TASKS.md": tasksMd({ P0: [LOOP], P2: [["- [ ] Normal work", "  - **ID**: normal-work"]] }) });
  try {
    const result = tasks(["pick"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /ID: normal-work/);
  } finally {
    cleanup(dir);
  }
});

test("US09 error: a queue with only a standing loop has nothing to pick", () => {
  const dir = scratchRepo({ "TASKS.md": tasksMd({ P0: [LOOP] }) });
  try {
    const result = tasks(["pick"], { cwd: dir });
    assert.match(result.stdout, /No eligible tasks found/);
  } finally {
    cleanup(dir);
  }
});
