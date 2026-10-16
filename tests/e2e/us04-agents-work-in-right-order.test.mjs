// US04 Agents work in the right order: blockers decide what is picked.
// Story: docs/user-stories/04-agents-work-in-right-order.md
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanup, scratchRepo, tasks, tasksMd } from "./helpers.mjs";

test("US04 happy: pick skips a blocked P1 and picks its P2 blocker", () => {
  const dir = scratchRepo({
    "TASKS.md": tasksMd({
      P1: [["- [ ] Ship the feature", "  - **ID**: ship", "  - **Blocked by**: schema"]],
      P2: [["- [ ] Add the schema", "  - **ID**: schema"]],
    }),
  });
  try {
    const result = tasks(["pick", "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    const picked = JSON.parse(result.stdout);
    assert.equal(picked.picked, true);
    assert.equal(picked.metadata.id, "schema");
    assert.equal(picked.unblocks, 1);
  } finally {
    cleanup(dir);
  }
});

test("US04 error: a blocker cycle leaves nothing to pick, and pick says so", () => {
  const dir = scratchRepo({
    "TASKS.md": tasksMd({
      P1: [
        ["- [ ] A", "  - **ID**: a", "  - **Blocked by**: b"],
        ["- [ ] B", "  - **ID**: b", "  - **Blocked by**: a"],
      ],
    }),
  });
  try {
    const result = tasks(["pick"], { cwd: dir });
    assert.match(result.stdout, /No eligible tasks found/);
  } finally {
    cleanup(dir);
  }
});
