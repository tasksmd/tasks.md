import { describe, it, expect } from "vitest";
import { parseTasksContent, parsePolicies, getAllTaskIds, isBlocked, pickBestTask, type Task, type TaskFile } from "./index.js";

const TEST_FILE = "/test/TASKS.md";

describe("parseTasksContent", () => {
  it("parses a minimal task", () => {
    const content = `# Tasks\n\n## P1\n\n- [ ] Do something\n`;
    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].summary).toBe("Do something");
    expect(tasks[0].priority).toBe("P1");
    expect(tasks[0].file).toBe(TEST_FILE);
    expect(tasks[0].startLine).toBe(5);
  });

  it("parses multiple priorities", () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Critical fix",
      "",
      "## P1",
      "",
      "- [ ] Important feature",
      "",
      "## P2",
      "",
      "- [ ] Nice to have",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].priority).toBe("P0");
    expect(tasks[1].priority).toBe("P1");
    expect(tasks[2].priority).toBe("P2");
  });

  it("parses multiple tasks under same priority", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] First task",
      "- [ ] Second task",
      "- [ ] Third task",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.priority === "P1")).toBe(true);
  });

  it("parses task with all metadata fields", () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Fix auth crash",
      "  - **ID**: auth-fix",
      "  - **Tags**: backend, auth",
      "  - **Details**: JWT refresh returns 500",
      "  - **Files**: `src/auth.ts`, `src/middleware.ts`",
      "  - **Acceptance**: Tests pass, no 500 errors",
      "  - **Blocked by**: setup-db",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);

    const task = tasks[0];
    expect(task.metadata.id).toBe("auth-fix");
    expect(task.metadata.tags).toEqual(["backend", "auth"]);
    expect(task.metadata.details).toBe("JWT refresh returns 500");
    expect(task.metadata.files).toEqual(["src/auth.ts", "src/middleware.ts"]);
    expect(task.metadata.acceptance).toBe("Tests pass, no 500 errors");
    expect(task.metadata.blockedBy).toEqual(["setup-db"]);
  });

  it("parses claimed task", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Build the widget (@cascade)",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].summary).toBe("Build the widget");
    expect(tasks[0].claimed).toBe("@cascade");
  });

  it("parses claimed task with 'in progress' suffix", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Build the widget (@cursor-bg - in progress)",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].summary).toBe("Build the widget");
    expect(tasks[0].claimed).toBe("@cursor-bg - in progress");
  });

  it("parses subtasks", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Refactor auth module",
      "  - **ID**: refactor-auth",
      "  - [ ] Extract token logic",
      "  - [ ] Add unit tests",
      "  - [ ] Update docs",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subtasks).toEqual([
      "Extract token logic",
      "Add unit tests",
      "Update docs",
    ]);
  });

  it("tracks correct line numbers", () => {
    const content = [
      "# Tasks",        // 1
      "",               // 2
      "## P1",          // 3
      "",               // 4
      "- [ ] First",    // 5
      "  - **ID**: a",  // 6
      "",               // 7
      "- [ ] Second",   // 8
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].startLine).toBe(5);
    expect(tasks[0].endLine).toBe(6);
    expect(tasks[1].startLine).toBe(8);
    expect(tasks[1].endLine).toBe(8);
  });

  it("handles multiline details", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Complex task",
      "  - **Details**: First line of details",
      "      continuation of details",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].metadata.details).toBe(
      "First line of details\ncontinuation of details"
    );
  });

  it("ignores tasks before any priority heading", () => {
    const content = [
      "# Tasks",
      "",
      "- [ ] Orphan task with no priority",
      "",
      "## P1",
      "",
      "- [ ] Real task",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].summary).toBe("Real task");
  });

  it("returns empty array for file with no tasks", () => {
    const content = "# Tasks\n\n## P1\n";
    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(0);
  });

  it("returns empty array for empty content", () => {
    const tasks = parseTasksContent("", TEST_FILE);
    expect(tasks).toHaveLength(0);
  });

  it("handles custom metadata fields", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Deploy service",
      "  - **Environment**: production",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].metadata.environment).toBe("production");
  });

  it("strips backticks from file paths", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Fix bug",
      "  - **Files**: `src/foo.ts`, `src/bar.ts`",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks[0].metadata.files).toEqual(["src/foo.ts", "src/bar.ts"]);
  });

  it("parses multiple blocked-by references", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Final step",
      "  - **Blocked by**: step-a, step-b, step-c",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks[0].metadata.blockedBy).toEqual(["step-a", "step-b", "step-c"]);
  });

  it("parses **Blocked** as a free-form reason string", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Post release notes in #eng-announcements",
      "  - **ID**: slack-release-notes",
      "  - **Blocked**: needs-user-approval — posting publicly in Slack as the user requires explicit per-session approval",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].metadata.blocked).toBe(
      "needs-user-approval — posting publicly in Slack as the user requires explicit per-session approval"
    );
    // **Blocked** must NOT leak into **Blocked by**
    expect(tasks[0].metadata.blockedBy).toBeUndefined();
  });

  it("keeps **Blocked** and **Blocked by** as distinct fields on the same task", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Ship the deploy",
      "  - **Blocked by**: prepare-release, sign-off",
      "  - **Blocked**: needs-credentials — production deploy token not yet provisioned",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks[0].metadata.blockedBy).toEqual(["prepare-release", "sign-off"]);
    expect(tasks[0].metadata.blocked).toBe(
      "needs-credentials — production deploy token not yet provisioned"
    );
  });

  it("parses **Research** as a free-form string and supports multiline continuations", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Post release notes",
      "  - **ID**: slack-release-notes",
      "  - **Research**: Draft message — 2026-04-20",
      "    Recipients: #eng-announcements (default), #customer-success (crosspost).",
      "    Tone: short bullets + rollback link matches prior release posts.",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].metadata.research).toBe(
      "Draft message — 2026-04-20\nRecipients: #eng-announcements (default), #customer-success (crosspost).\nTone: short bullets + rollback link matches prior release posts."
    );
  });

  it("parses **Last-enriched** as an ISO date string", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Post release notes",
      "  - **Last-enriched**: 2026-04-20",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    expect(tasks[0].metadata.lastEnriched).toBe("2026-04-20");
  });

  it("**Research** and **Last-enriched** coexist with **Blocked** without collision", () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Post release notes",
      "  - **ID**: slack-release-notes",
      "  - **Blocked**: needs-user-approval — posting publicly as the user",
      "  - **Research**: Draft text sampled from prior releases.",
      "  - **Last-enriched**: 2026-04-20",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    const meta = tasks[0].metadata;
    expect(meta.blocked).toBe("needs-user-approval — posting publicly as the user");
    expect(meta.research).toBe("Draft text sampled from prior releases.");
    expect(meta.lastEnriched).toBe("2026-04-20");
    // Enrichment fields must never accidentally unblock the task.
    expect(meta.blockedBy).toBeUndefined();
  });
});

describe("getAllTaskIds", () => {
  it("collects IDs across multiple files", () => {
    const files: TaskFile[] = [
      {
        path: "/a/TASKS.md",
        tasks: [
          makeFakeTask({ id: "task-a" }),
          makeFakeTask({ id: "task-b" }),
        ],
      },
      {
        path: "/b/TASKS.md",
        tasks: [
          makeFakeTask({ id: "task-c" }),
          makeFakeTask({}), // no ID
        ],
      },
    ];

    const ids = getAllTaskIds(files);
    expect(ids).toEqual(new Set(["task-a", "task-b", "task-c"]));
  });

  it("returns empty set when no tasks have IDs", () => {
    const files: TaskFile[] = [
      { path: "/TASKS.md", tasks: [makeFakeTask({})] },
    ];
    expect(getAllTaskIds(files)).toEqual(new Set());
  });
});

describe("isBlocked", () => {
  it("returns true when blocker ID exists in set", () => {
    const task = makeFakeTask({ blockedBy: ["auth-fix"] });
    const allIds = new Set(["auth-fix", "other"]);
    expect(isBlocked(task, allIds)).toBe(true);
  });

  it("returns false when blocker ID has been removed", () => {
    const task = makeFakeTask({ blockedBy: ["auth-fix"] });
    const allIds = new Set(["other"]);
    expect(isBlocked(task, allIds)).toBe(false);
  });

  it("returns false when task has no blockers", () => {
    const task = makeFakeTask({});
    const allIds = new Set(["auth-fix"]);
    expect(isBlocked(task, allIds)).toBe(false);
  });

  it("returns true when any blocker exists", () => {
    const task = makeFakeTask({ blockedBy: ["done-task", "still-open"] });
    const allIds = new Set(["still-open"]);
    expect(isBlocked(task, allIds)).toBe(true);
  });

  it("returns true when **Blocked** has a non-empty reason, even without **Blocked by**", () => {
    const task = makeFakeTask({
      blocked: "needs-user-approval — posting publicly in Slack as the user requires explicit per-session approval",
    });
    expect(isBlocked(task, new Set())).toBe(true);
  });

  it("treats whitespace-only **Blocked** as not blocking", () => {
    const task = makeFakeTask({ blocked: "   " });
    expect(isBlocked(task, new Set())).toBe(false);
  });

  it("blocks when **Blocked** reason is set but **Blocked by** IDs are resolved", () => {
    const task = makeFakeTask({
      blocked: "policy-refused — posting publicly as the user is not pre-approved",
      blockedBy: ["already-shipped"],
    });
    // No ID matches blockedBy, but blocked reason still blocks the task
    expect(isBlocked(task, new Set())).toBe(true);
  });

  it("still reports blocked after enrichment fields are added", () => {
    const task = makeFakeTask({
      blocked: "needs-user-approval — posting publicly as the user",
    });
    // Simulate an agent enriching the task — adding Research + Last-enriched
    // must NOT flip the block status. Only removing **Blocked** unblocks it.
    task.metadata.research = "Drafted the announcement text and listed recipients.";
    task.metadata.lastEnriched = "2026-04-20";
    expect(isBlocked(task, new Set())).toBe(true);
  });
});

function makeFakeTask(metadata: { id?: string; blockedBy?: string[]; blocked?: string }): Task {
  return {
    summary: "fake task",
    priority: "P1",
    metadata: {
      id: metadata.id,
      blockedBy: metadata.blockedBy,
      blocked: metadata.blocked,
    },
    subtasks: [],
    file: TEST_FILE,
    startLine: 1,
    endLine: 1,
    rawLines: ["- [ ] fake task"],
  };
}

// ── parsePolicies ─────────────────────────────────────────────────────────────

describe("parsePolicies", () => {
  it("extracts file-level policies from HTML comments", () => {
    const content = `# Tasks

<!-- policy: Always run tests before committing.
     policy: Never skip CI checks. -->

## P0

- [ ] Fix the bug
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(2);
    expect(policies[0]).toEqual({ text: "Always run tests before committing.", scope: "file" });
    expect(policies[1]).toEqual({ text: "Never skip CI checks.", scope: "file" });
  });

  it("extracts section-level policies scoped to priority", () => {
    const content = `# Tasks

## P1

<!-- policy: P1 tasks need a Jira ticket. -->

- [ ] Add feature
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toEqual({ text: "P1 tasks need a Jira ticket.", scope: "P1" });
  });

  it("handles both file-level and section-level policies", () => {
    const content = `# Tasks

<!-- policy: Global rule applies everywhere. -->

## P0

- [ ] Urgent fix

## P1

<!-- policy: Section rule for P1 only. -->

- [ ] Feature work
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(2);
    expect(policies[0].scope).toBe("file");
    expect(policies[1].scope).toBe("P1");
  });

  it("ignores comments without policy: prefix", () => {
    const content = `# Tasks

<!-- Last reviewed: 2026-04-01. Just a note. -->

## P0

- [ ] Task
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(0);
  });

  it("handles single-line HTML comments", () => {
    const content = `# Tasks

<!-- policy: Keep it simple. -->

## P0
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(1);
    expect(policies[0].text).toBe("Keep it simple.");
  });

  it("handles policy: with varying whitespace and casing", () => {
    const content = `# Tasks

<!-- Policy:  Uppercase P works too.
     POLICY: ALL CAPS works.
     policy:no space after colon works. -->

## P0
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(3);
    expect(policies[0].text).toBe("Uppercase P works too.");
    expect(policies[1].text).toBe("ALL CAPS works.");
    expect(policies[2].text).toBe("no space after colon works.");
  });

  it("returns empty array when no comments exist", () => {
    const content = `# Tasks

## P0

- [ ] Do something
`;
    expect(parsePolicies(content)).toEqual([]);
  });

  it("strips trailing --> from policy text", () => {
    const content = `# Tasks\n\n<!-- policy: Single line policy. -->\n`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(1);
    expect(policies[0].text).not.toContain("-->");
  });

  it("handles multiline comment with policy on a separate line", () => {
    const content = `# Tasks

<!--
  policy: This policy spans multiple lines in the comment block.
-->

## P0
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(1);
    expect(policies[0].text).toBe("This policy spans multiple lines in the comment block.");
    expect(policies[0].scope).toBe("file");
  });

  it("scopes policies to different priority sections independently", () => {
    const content = `# Tasks

## P0

<!-- policy: P0 rule. -->

## P1

<!-- policy: P1 rule. -->

## P2

<!-- policy: P2 rule. -->

## P3

<!-- policy: P3 rule. -->
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(4);
    expect(policies[0]).toEqual({ text: "P0 rule.", scope: "P0" });
    expect(policies[1]).toEqual({ text: "P1 rule.", scope: "P1" });
    expect(policies[2]).toEqual({ text: "P2 rule.", scope: "P2" });
    expect(policies[3]).toEqual({ text: "P3 rule.", scope: "P3" });
  });

  it("ignores empty policy text after prefix", () => {
    const content = `# Tasks\n\n<!-- policy: -->\n\n## P0\n`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(0);
  });

  it("handles multiple separate comment blocks", () => {
    const content = `# Tasks

<!-- policy: First rule. -->
<!-- policy: Second rule. -->

## P0
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(2);
    expect(policies[0].text).toBe("First rule.");
    expect(policies[1].text).toBe("Second rule.");
  });

  it("does not extract policies from task metadata or body text", () => {
    const content = `# Tasks

## P1

- [ ] Update policy: documentation
  - **Details**: The policy: prefix in task text should not be extracted.
`;
    const policies = parsePolicies(content);
    expect(policies).toHaveLength(0);
  });
});

// ── pickBestTask — picks skip tasks with **Blocked** reason ────────────────────

describe("pickBestTask and **Blocked** tasks", () => {
  it("skips tasks with a non-empty **Blocked** reason", () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Post release notes in Slack",
      "  - **ID**: slack-release-notes",
      "  - **Blocked**: needs-user-approval — posting publicly as the user requires explicit approval",
      "",
      "- [ ] Ship the bug fix",
      "  - **ID**: ship-fix",
      "",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    const result = pickBestTask([{ path: TEST_FILE, tasks }]);

    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Ship the bug fix");
  });

  it("returns undefined when every task is blocked by reason", () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Post in Slack",
      "  - **ID**: slack-post",
      "  - **Blocked**: needs-user-approval — posting publicly as the user",
      "",
      "- [ ] Create Jira ticket",
      "  - **ID**: jira-create",
      "  - **Blocked**: needs-user-approval — writing to Jira on behalf of the user",
      "",
    ].join("\n");

    const tasks = parseTasksContent(content, TEST_FILE);
    const result = pickBestTask([{ path: TEST_FILE, tasks }]);

    expect(result).toBeUndefined();
  });

  it("picks a task again once the **Blocked** line is removed", () => {
    const blocked = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Post release notes",
      "  - **ID**: release-notes",
      "  - **Blocked**: needs-user-approval — posting publicly as the user",
      "",
    ].join("\n");

    const blockedTasks = parseTasksContent(blocked, TEST_FILE);
    expect(pickBestTask([{ path: TEST_FILE, tasks: blockedTasks }])).toBeUndefined();

    const unblocked = blocked.replace(/  - \*\*Blocked\*\*:.*\n/, "");
    const unblockedTasks = parseTasksContent(unblocked, TEST_FILE);
    const picked = pickBestTask([{ path: TEST_FILE, tasks: unblockedTasks }]);

    expect(picked).toBeDefined();
    expect(picked!.task.metadata.id).toBe("release-notes");
  });
});
