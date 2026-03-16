import { describe, it, expect } from "vitest";
import { parseTasksContent, getAllTaskIds, isBlocked, type Task, type TaskFile } from "./parser.js";

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
});

function makeFakeTask(metadata: { id?: string; blockedBy?: string[] }): Task {
  return {
    summary: "fake task",
    priority: "P1",
    metadata: {
      id: metadata.id,
      blockedBy: metadata.blockedBy,
    },
    subtasks: [],
    file: TEST_FILE,
    startLine: 1,
    endLine: 1,
    rawLines: ["- [ ] fake task"],
  };
}
