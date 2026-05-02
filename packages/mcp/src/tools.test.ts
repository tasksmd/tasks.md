import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTasksContent, type TaskFile } from "./parser.js";
import {
  listTasksFromFiles,
  claimTask,
  unclaimTask,
  completeTask,
  addTask,
  pickTask,
  enrichTask,
} from "./tools.js";

// ── Helpers ──

function makeTaskFile(content: string, filePath: string): TaskFile {
  return {
    path: filePath,
    tasks: parseTasksContent(content, filePath),
  };
}

const FIXTURE = [
  "# Tasks",
  "",
  "## P0",
  "",
  "- [ ] Fix critical auth crash",
  "  - **ID**: auth-fix",
  "  - **Tags**: backend, auth",
  "  - **Details**: JWT refresh returns 500",
  "  - **Files**: `src/auth.ts`",
  "",
  "## P1",
  "",
  "- [ ] Add rate limiting (@cascade)",
  "  - **ID**: rate-limit",
  "  - **Tags**: backend, api",
  "",
  "- [ ] Migrate database queries",
  "  - **ID**: db-migrate",
  "  - **Blocked by**: auth-fix",
  "",
  "## P2",
  "",
  "- [ ] Update README",
  "",
].join("\n");

// ── list_tasks ──

describe("listTasksFromFiles", () => {
  it("returns all tasks when no filters", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files);
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(4);
    expect(data.summary).toContain("4 task(s)");
  });

  it("filters by priority", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { priority: "P1" });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.every((t: { priority: string }) => t.priority === "P1")).toBe(true);
  });

  it("filters by priority case-insensitively", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { priority: "p0" });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].summary).toBe("Fix critical auth crash");
  });

  it("filters by tag", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { tag: "auth" });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].summary).toBe("Fix critical auth crash");
  });

  it("filters by tag case-insensitively", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { tag: "API" });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].summary).toBe("Add rate limiting");
  });

  it("filters unclaimed only", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { unclaimed_only: true });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(3);
    expect(data.tasks.every((t: { claimed: string | null }) => t.claimed === null)).toBe(true);
  });

  it("filters unblocked only", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { unblocked_only: true });
    const data = JSON.parse(result.text);

    // db-migrate is blocked by auth-fix which exists
    expect(data.tasks).toHaveLength(3);
    const summaries = data.tasks.map((t: { summary: string }) => t.summary);
    expect(summaries).not.toContain("Migrate database queries");
  });

  it("combines multiple filters", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, {
      priority: "P1",
      unclaimed_only: true,
      unblocked_only: true,
    });
    const data = JSON.parse(result.text);

    // P1 unclaimed + unblocked = only db-migrate is blocked, rate-limit is claimed
    // So nothing matches all three
    expect(data.tasks).toHaveLength(0);
  });

  it("returns empty message when no tasks match", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files, { priority: "P3" });
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(0);
    expect(data.summary).toBe("No tasks found matching the filters.");
  });

  it("sorts by priority (P0 first)", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files);
    const data = JSON.parse(result.text);

    const priorities = data.tasks.map((t: { priority: string }) => t.priority);
    expect(priorities).toEqual(["P0", "P1", "P1", "P2"]);
  });

  it("marks blocked tasks correctly", () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = listTasksFromFiles(files);
    const data = JSON.parse(result.text);

    const dbMigrate = data.tasks.find((t: { summary: string }) => t.summary === "Migrate database queries");
    expect(dbMigrate.blocked).toBe(true);

    const authFix = data.tasks.find((t: { summary: string }) => t.summary === "Fix critical auth crash");
    expect(authFix.blocked).toBe(false);
  });

  it("works with multiple files", () => {
    const file1 = makeTaskFile(
      "# Tasks\n\n## P0\n\n- [ ] Task A\n",
      "/a/TASKS.md"
    );
    const file2 = makeTaskFile(
      "# Tasks\n\n## P1\n\n- [ ] Task B\n",
      "/b/TASKS.md"
    );
    const result = listTasksFromFiles([file1, file2]);
    const data = JSON.parse(result.text);

    expect(data.tasks).toHaveLength(2);
    expect(data.summary).toContain("2 file(s)");
  });
});

// ── claim_task ──

describe("claimTask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("claims a task by ID", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Do the thing\n  - **ID**: do-thing\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await claimTask(files, "do-thing", "cascade");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Claimed");
    expect(result.text).toContain("(@cascade)");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Do the thing (@cascade)");
  });

  it("claims a task by summary substring", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Fix the authentication bug\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await claimTask(files, "authentication", "cursor");

    expect(result.isError).toBeUndefined();

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Fix the authentication bug (@cursor)");
  });

  it("prefers an exact ID over an earlier summary substring match", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Summary mentions exact-target",
      "  - **ID**: summary-collision",
      "",
      "- [ ] Exact ID target",
      "  - **ID**: exact-target",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await claimTask(files, "exact-target", "cascade");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Claimed "Exact ID target"');

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Summary mentions exact-target\n");
    expect(updated).toContain("- [ ] Exact ID target (@cascade)");
  });

  it("strips @ prefix from agent name", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Some task\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    await claimTask(files, "Some task", "@cascade");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("(@cascade)");
    expect(updated).not.toContain("(@@cascade)");
  });

  it("returns error when task not found", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing task\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await claimTask(files, "nonexistent", "cascade");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("No task found");
  });

  it("returns error when task already claimed", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Claimed task (@other-agent)\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await claimTask(files, "Claimed task", "cascade");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("already claimed");
  });

  it("preserves other tasks when claiming", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] First task",
      "- [ ] Second task",
      "- [ ] Third task",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    await claimTask(files, "Second task", "cascade");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] First task");
    expect(updated).toContain("- [ ] Second task (@cascade)");
    expect(updated).toContain("- [ ] Third task");
  });
});

// ── unclaim_task ──

describe("unclaimTask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-unclaim-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("removes claim from a claimed task", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Fix auth bug (@cascade)\n  - **ID**: auth-fix\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await unclaimTask(files, "auth-fix");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Unclaimed");
    expect(result.text).toContain("@cascade");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Fix auth bug\n");
    expect(updated).not.toContain("@cascade");
  });

  it("prefers an exact ID over an earlier summary substring match", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Summary mentions exact-target (@summary-agent)",
      "  - **ID**: summary-collision",
      "",
      "- [ ] Exact ID target (@exact-agent)",
      "  - **ID**: exact-target",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await unclaimTask(files, "exact-target");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Unclaimed "Exact ID target"');

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Summary mentions exact-target (@summary-agent)");
    expect(updated).toContain("- [ ] Exact ID target\n");
  });

  it("errors when task is not claimed", async () => {
    const content = "# Tasks\n\n## P1\n\n- [ ] Unclaimed task\n  - **ID**: unclaimed\n";
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await unclaimTask(files, "unclaimed");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("not claimed");
  });

  it("errors when task not found", async () => {
    const content = "# Tasks\n\n## P1\n\n- [ ] Some task\n";
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await unclaimTask(files, "nonexistent");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("No task found");
  });

  it("handles claim with 'in progress' suffix", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Deploy service (@cursor-bg - in progress)\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await unclaimTask(files, "Deploy service");

    expect(result.isError).toBeUndefined();
    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Deploy service\n");
    expect(updated).not.toContain("@cursor-bg");
  });
});

// ── complete_task ──

describe("completeTask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("removes a simple task", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Task to remove",
      "",
      "- [ ] Task to keep",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await completeTask(files, "Task to remove");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Removed");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).not.toContain("Task to remove");
    expect(updated).toContain("Task to keep");
  });

  it("removes a task with metadata block", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Fix auth crash",
      "  - **ID**: auth-fix",
      "  - **Details**: JWT returns 500",
      "  - **Files**: `src/auth.ts`",
      "",
      "## P1",
      "",
      "- [ ] Other task",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await completeTask(files, "auth-fix");

    expect(result.isError).toBeUndefined();

    const updated = await readFile(filePath, "utf-8");
    expect(updated).not.toContain("Fix auth crash");
    expect(updated).not.toContain("auth-fix");
    expect(updated).not.toContain("JWT returns 500");
    expect(updated).toContain("Other task");
    expect(updated).toContain("## P0");
    expect(updated).toContain("## P1");
  });

  it("removes task by summary substring", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Migrate database queries\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await completeTask(files, "database");

    expect(result.isError).toBeUndefined();

    const updated = await readFile(filePath, "utf-8");
    expect(updated).not.toContain("Migrate database");
  });

  it("prefers an exact ID over an earlier summary substring match", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Summary mentions exact-target",
      "  - **ID**: summary-collision",
      "",
      "- [ ] Exact ID target",
      "  - **ID**: exact-target",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await completeTask(files, "exact-target");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Removed "Exact ID target"');

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Summary mentions exact-target");
    expect(updated).not.toContain("Exact ID target");
    expect(updated).not.toContain("  - **ID**: exact-target");
  });

  it("returns error when task not found", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing task\n";
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    const result = await completeTask(files, "nonexistent");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("No task found");
  });

  it("preserves file structure after removal", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] P0 task",
      "",
      "## P1",
      "",
      "- [ ] First P1",
      "  - **ID**: first",
      "",
      "- [ ] Second P1",
      "",
      "## P2",
      "",
      "- [ ] P2 task",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const files = [makeTaskFile(content, filePath)];
    await completeTask(files, "first");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("# Tasks");
    expect(updated).toContain("## P0");
    expect(updated).toContain("P0 task");
    expect(updated).toContain("## P1");
    expect(updated).toContain("Second P1");
    expect(updated).toContain("## P2");
    expect(updated).toContain("P2 task");
    expect(updated).not.toContain("First P1");
  });
});

// ── pick_task ──

describe("pickTask", () => {
  it("picks highest priority unblocked unclaimed task", async () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task).not.toBeNull();
    expect(data.task.summary).toBe("Fix critical auth crash");
    expect(data.task.priority).toBe("P0");
  });

  it("skips claimed tasks", async () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Claimed P0 (@someone)",
      "",
      "## P1",
      "",
      "- [ ] Unclaimed P1",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Unclaimed P1");
  });

  it("skips blocked tasks", async () => {
    const files = [makeTaskFile(FIXTURE, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task.summary).not.toBe("Migrate database queries");
  });

  it("skips tasks blocked with a free-form **Blocked** reason", async () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Post release notes in Slack",
      "  - **ID**: slack-release",
      "  - **Blocked**: needs-user-approval — posting publicly as the user",
      "",
      "## P1",
      "",
      "- [ ] Ship the bug fix",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Ship the bug fix");
  });

  it("skips standing-loop tasks during automatic selection", async () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Refill the queue",
      "  - **ID**: standing-audit-gap-loop",
      "  - **Tags**: standing-loop, audit-only",
      "",
      "## P1",
      "",
      "- [ ] Ship normal work",
      "  - **ID**: ship-normal-work",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Ship normal work");
    expect(data.task.metadata.id).toBe("ship-normal-work");
  });

  it("returns no task when every candidate has a **Blocked** reason", async () => {
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
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task).toBeNull();
    expect(data.summary).toMatch(/No eligible tasks/);
  });

  it("prefers tasks that unblock others", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Unblocking task",
      "  - **ID**: blocker",
      "",
      "- [ ] Standalone task",
      "",
      "- [ ] Blocked downstream",
      "  - **Blocked by**: blocker",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Unblocking task");
    expect(data.summary).toContain("unblocks 1");
  });

  it("filters by tags when provided", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Backend task",
      "  - **Tags**: backend, api",
      "",
      "- [ ] Frontend task",
      "  - **Tags**: frontend",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { tags: ["frontend"] });
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Frontend task");
  });

  it("returns null task when no candidates", async () => {
    const content = "# Tasks\n\n## P1\n\n- [ ] Only task (@claimed)\n";
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files);
    const data = JSON.parse(result.text);

    expect(data.task).toBeNull();
    expect(data.summary).toContain("No eligible tasks");
  });

  it("resumes prior claim when agent already has a claimed task", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Already claimed (@cascade)",
      "  - **ID**: prior-claim",
      "",
      "- [ ] Unclaimed task",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { agent_name: "cascade" });
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Already claimed");
    expect(data.resumed).toBe(true);
    expect(data.summary).toContain("Resuming");
    expect(data.summary).toContain("@cascade");
  });

  it("does not resume standing-loop claims during automatic selection", async () => {
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-pick-standing-loop-"));
    try {
      const filePath = join(tmpDir, "TASKS.md");
      const content = [
        "# Tasks",
        "",
        "## P0",
        "",
        "- [ ] Refill the queue (@cascade)",
        "  - **ID**: standing-audit-gap-loop",
        "  - **Tags**: standing-loop, audit-only",
        "",
        "## P1",
        "",
        "- [ ] Ship normal work",
        "  - **ID**: ship-normal-work",
        "",
      ].join("\n");
      await writeFile(filePath, content, "utf-8");

      const files = [makeTaskFile(content, filePath)];
      const result = await pickTask(files, { agent_name: "cascade" });
      const data = JSON.parse(result.text);

      expect(data.task.summary).toBe("Ship normal work");
      expect(data.resumed).toBeUndefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("resumes prior claim with 'in progress' suffix", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] In progress task (@cascade - in progress)",
      "  - **ID**: ip-task",
      "",
      "- [ ] Unclaimed task",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { agent_name: "cascade" });
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("In progress task");
    expect(data.resumed).toBe(true);
    expect(data.summary).toContain("Resuming");
  });

  it("skips blocked prior claims and picks new task", async () => {
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-pick-"));
    try {
      const filePath = join(tmpDir, "TASKS.md");
      const content = [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Blocked claimed (@cascade)",
        "  - **ID**: blocked-claim",
        "  - **Blocked by**: some-blocker",
        "",
        "- [ ] Some blocker",
        "  - **ID**: some-blocker",
        "",
      ].join("\n");
      await writeFile(filePath, content, "utf-8");

      const files = [makeTaskFile(content, filePath)];
      const result = await pickTask(files, { agent_name: "cascade" });
      const data = JSON.parse(result.text);

      expect(data.task.summary).toBe("Some blocker");
      expect(data.resumed).toBeUndefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("prefers tasks with more overlapping tags", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Single tag match",
      "  - **Tags**: backend",
      "",
      "- [ ] Double tag match",
      "  - **Tags**: backend, api",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { tags: ["backend", "api"] });
    const data = JSON.parse(result.text);

    expect(data.task.summary).toBe("Double tag match");
  });

  it("auto-claims when agent_name is provided", async () => {
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-pick-"));
    try {
      const filePath = join(tmpDir, "TASKS.md");
      const content = "# Tasks\n\n## P1\n\n- [ ] Pick me\n  - **ID**: pick-me\n";
      await writeFile(filePath, content, "utf-8");

      const files = [makeTaskFile(content, filePath)];
      const result = await pickTask(files, { agent_name: "cascade" });
      const data = JSON.parse(result.text);

      expect(data.task.summary).toBe("Pick me");
      expect(data.task.claimed).toBe("@cascade");
      expect(data.summary).toContain("Claimed for @cascade");

      const updated = await readFile(filePath, "utf-8");
      expect(updated).toContain("(@cascade)");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not claim when agent_name is omitted", async () => {
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-pick-"));
    try {
      const filePath = join(tmpDir, "TASKS.md");
      const content = "# Tasks\n\n## P1\n\n- [ ] Pick me\n  - **ID**: pick-me\n";
      await writeFile(filePath, content, "utf-8");

      const files = [makeTaskFile(content, filePath)];
      const result = await pickTask(files);
      const data = JSON.parse(result.text);

      expect(data.task.claimed).toBeNull();

      const updated = await readFile(filePath, "utf-8");
      expect(updated).not.toContain("(@");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("targets an exact task_id and ignores queue priority ordering", async () => {
    const content = [
      "# Tasks",
      "",
      "## P0",
      "",
      "- [ ] Urgent queue task",
      "  - **ID**: urgent-queue-task",
      "",
      "## P2",
      "",
      "- [ ] Run the standing audit loop",
      "  - **ID**: standing-audit-gap-loop",
      "  - **Tags**: standing-loop, audit, queue",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { task_id: "standing-audit-gap-loop" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBeUndefined();
    expect(data.status).toBe("ready");
    expect(data.targeted).toBe(true);
    expect(data.task.summary).toBe("Run the standing audit loop");
    expect(data.task.metadata.tags).toEqual(["standing-loop", "audit", "queue"]);
    expect(data.candidates_count).toBeUndefined();
  });

  it("claims an exact task_id when agent_name is provided", async () => {
    let tmpDir: string;
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-target-"));
    try {
      const filePath = join(tmpDir, "TASKS.md");
      const content = "# Tasks\n\n## P1\n\n- [ ] Target me\n  - **ID**: target-me\n";
      await writeFile(filePath, content, "utf-8");

      const files = [makeTaskFile(content, filePath)];
      const result = await pickTask(files, {
        task_id: "target-me",
        agent_name: "cascade",
      });
      const data = JSON.parse(result.text);

      expect(result.isError).toBeUndefined();
      expect(data.status).toBe("claimed");
      expect(data.task.claimed).toBe("@cascade");
      expect(data.summary).toContain("Claimed for @cascade");

      const updated = await readFile(filePath, "utf-8");
      expect(updated).toContain("- [ ] Target me (@cascade)");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns a missing status when task_id does not match an exact ID", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Summary mentions target-me but has a different ID",
      "  - **ID**: different-id",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { task_id: "target-me" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBe(true);
    expect(data.status).toBe("missing");
    expect(data.task).toBeNull();
  });

  it("returns duplicate status when task_id appears more than once", async () => {
    const file1 = makeTaskFile(
      "# Tasks\n\n## P1\n\n- [ ] First target\n  - **ID**: duplicate-id\n",
      "/a/TASKS.md"
    );
    const file2 = makeTaskFile(
      "# Tasks\n\n## P2\n\n- [ ] Second target\n  - **ID**: duplicate-id\n",
      "/b/TASKS.md"
    );
    const result = await pickTask([file1, file2], { task_id: "duplicate-id" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBe(true);
    expect(data.status).toBe("duplicate");
    expect(data.matches).toHaveLength(2);
    expect(data.matches.map((task: { summary: string }) => task.summary)).toEqual([
      "First target",
      "Second target",
    ]);
  });

  it("refuses a targeted task_id claimed by another agent", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Already claimed (@someone)",
      "  - **ID**: claimed-target",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, {
      task_id: "claimed-target",
      agent_name: "cascade",
    });
    const data = JSON.parse(result.text);

    expect(result.isError).toBe(true);
    expect(data.status).toBe("already_claimed");
    expect(data.task.claimed).toBe("@someone");
    expect(data.summary).toContain("@someone");
  });

  it("resumes a targeted task_id already claimed by the same agent", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Resume me (@cascade - in progress)",
      "  - **ID**: resume-target",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, {
      task_id: "resume-target",
      agent_name: "cascade",
    });
    const data = JSON.parse(result.text);

    expect(result.isError).toBeUndefined();
    expect(data.status).toBe("resumed");
    expect(data.resumed).toBe(true);
    expect(data.task.summary).toBe("Resume me");
  });

  it("refuses a targeted task_id with a **Blocked** reason", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Post in Slack",
      "  - **ID**: slack-post",
      "  - **Blocked**: needs-user-approval — posting publicly as the user",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { task_id: "slack-post" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBe(true);
    expect(data.status).toBe("blocked");
    expect(data.blockers.blocked).toContain("needs-user-approval");
    expect(data.blockers.blocked_by).toEqual([]);
  });

  it("refuses a targeted task_id with unresolved **Blocked by** dependencies", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Build prerequisite",
      "  - **ID**: prerequisite",
      "",
      "- [ ] Use prerequisite",
      "  - **ID**: blocked-target",
      "  - **Blocked by**: prerequisite, already-done",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { task_id: "blocked-target" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBe(true);
    expect(data.status).toBe("blocked");
    expect(data.blockers.blocked).toBeNull();
    expect(data.blockers.blocked_by).toEqual(["prerequisite"]);
  });

  it("allows a targeted task_id when **Blocked by** references are resolved", async () => {
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] Follow-up task",
      "  - **ID**: follow-up",
      "  - **Blocked by**: completed-task",
      "",
    ].join("\n");
    const files = [makeTaskFile(content, "/test/TASKS.md")];
    const result = await pickTask(files, { task_id: "follow-up" });
    const data = JSON.parse(result.text);

    expect(result.isError).toBeUndefined();
    expect(data.status).toBe("ready");
    expect(data.task.blocked).toBe(false);
  });
});

// ── add_task ──

describe("addTask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("adds a simple task to existing section", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing task\n";
    await writeFile(filePath, content, "utf-8");

    const result = await addTask(filePath, {
      summary: "New task",
      priority: "P1",
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Added");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Existing task");
    expect(updated).toContain("- [ ] New task");
  });

  it("adds task with all metadata fields", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Full task",
      priority: "P1",
      id: "full-task",
      tags: "backend, api",
      details: "Detailed description",
      files: "`src/api.ts`",
      acceptance: "Tests pass",
      blocked_by: "other-task",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Full task");
    expect(updated).toContain("  - **ID**: full-task");
    expect(updated).toContain("  - **Tags**: backend, api");
    expect(updated).toContain("  - **Details**: Detailed description");
    expect(updated).toContain("  - **Files**: `src/api.ts`");
    expect(updated).toContain("  - **Acceptance**: Tests pass");
    expect(updated).toContain("  - **Blocked by**: other-task");
  });

  it("adds a task with a **Blocked** reason line", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Post release notes in Slack",
      priority: "P1",
      id: "slack-release",
      blocked:
        "needs-user-approval — posting publicly in Slack as the user requires explicit per-session approval",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Post release notes in Slack");
    expect(updated).toContain(
      "  - **Blocked**: needs-user-approval — posting publicly in Slack as the user requires explicit per-session approval"
    );
  });

  it("omits the **Blocked** line when blocked is whitespace-only or missing", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Plain task",
      priority: "P1",
      blocked: "   ",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Plain task");
    expect(updated).not.toMatch(/\*\*Blocked\*\*:/);
  });

  it("adds a task with **Research** and **Last-enriched** fields", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Post release summary",
      priority: "P1",
      blocked: "needs-user-approval — posting publicly as the user",
      research: "2026-04-20 — draft message sampled from prior releases",
      last_enriched: "2026-04-20",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("  - **Research**: 2026-04-20 — draft message sampled from prior releases");
    expect(updated).toContain("  - **Last-enriched**: 2026-04-20");
  });

  it("rejects last_enriched values that are not ISO dates", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    const result = await addTask(filePath, {
      summary: "Post release summary",
      priority: "P1",
      last_enriched: "yesterday",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Invalid last_enriched/);
    const updated = await readFile(filePath, "utf-8");
    expect(updated).not.toContain("Post release summary");
  });

  it("creates a new priority section when needed", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] P1 task\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Critical fix",
      priority: "P0",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("## P0");
    expect(updated).toContain("- [ ] Critical fix");
    // P0 should come before P1
    const p0Index = updated.indexOf("## P0");
    const p1Index = updated.indexOf("## P1");
    expect(p0Index).toBeLessThan(p1Index);
  });

  it("creates section in correct order for higher priority", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P0\n\n- [ ] P0 task\n\n## P2\n\n- [ ] P2 task\n";
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "P1 task",
      priority: "P1",
    });

    const updated = await readFile(filePath, "utf-8");
    const p0Index = updated.indexOf("## P0");
    const p1Index = updated.indexOf("## P1");
    const p2Index = updated.indexOf("## P2");
    expect(p0Index).toBeLessThan(p1Index);
    expect(p1Index).toBeLessThan(p2Index);
  });

  it("defaults priority to P2", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P2\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    const result = await addTask(filePath, { summary: "Default priority task" });

    expect(result.text).toContain("P2");

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("- [ ] Default priority task");
  });

  it("normalizes priority to uppercase", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = "# Tasks\n\n## P1\n\n- [ ] Existing\n";
    await writeFile(filePath, content, "utf-8");

    const result = await addTask(filePath, {
      summary: "Lowercase priority",
      priority: "p1",
    });

    expect(result.text).toContain("P1");
  });

  it("returns error when file cannot be read", async () => {
    const result = await addTask("/nonexistent/TASKS.md", {
      summary: "Task",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Cannot read");
  });

  it("rejects invalid priority", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    await writeFile(filePath, "# Tasks\n\n## P1\n\n- [ ] Existing\n", "utf-8");

    const result = await addTask(filePath, {
      summary: "Bad priority",
      priority: "P5",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid priority");
    expect(result.text).toContain("P0, P1, P2, or P3");
  });

  it("rejects non-kebab-case ID", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    await writeFile(filePath, "# Tasks\n\n## P1\n\n- [ ] Existing\n", "utf-8");

    const result = await addTask(filePath, {
      summary: "Bad ID",
      priority: "P1",
      id: "Bad_ID",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid ID");
    expect(result.text).toContain("kebab-case");
  });

  it("lowercases tags automatically", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    await writeFile(filePath, "# Tasks\n\n## P1\n\n- [ ] Existing\n", "utf-8");

    await addTask(filePath, {
      summary: "Tagged task",
      priority: "P1",
      tags: "Backend, API",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("**Tags**: backend, api");
    expect(updated).not.toContain("Backend");
  });

  it("preserves existing tasks when adding", async () => {
    const filePath = join(tmpDir, "TASKS.md");
    const content = [
      "# Tasks",
      "",
      "## P1",
      "",
      "- [ ] First task",
      "  - **ID**: first",
      "",
      "- [ ] Second task",
      "",
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    await addTask(filePath, {
      summary: "Third task",
      priority: "P1",
    });

    const updated = await readFile(filePath, "utf-8");
    expect(updated).toContain("First task");
    expect(updated).toContain("Second task");
    expect(updated).toContain("Third task");
  });
});

// ── enrichTask ──

describe("enrichTask", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tasks-enrich-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function seed(content: string): Promise<{ filePath: string; taskFiles: TaskFile[] }> {
    const filePath = join(tmpDir, "TASKS.md");
    await writeFile(filePath, content, "utf-8");
    const taskFiles = [makeTaskFile(content, filePath)];
    return { filePath, taskFiles };
  }

  it("adds **Research** and **Last-enriched** when neither exists yet", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Post release notes in Slack",
        "  - **ID**: slack-release",
        "  - **Blocked**: needs-user-approval — posting publicly as the user",
        "",
      ].join("\n")
    );

    const result = await enrichTask(taskFiles, "slack-release", {
      research: "Draft sampled from prior releases.",
      date: "2026-04-20",
      label: "draft message",
    });

    expect(result.isError).toBeUndefined();
    const updated = await readFile(filePath, "utf-8");
    // Research heading is inline with the field label so the parser keeps the
    // first line non-empty; the body is indented 4 spaces (continuation form).
    expect(updated).toContain("- **Research**: 2026-04-20 — draft message");
    expect(updated).toContain("    Draft sampled from prior releases.");
    expect(updated).toContain("- **Last-enriched**: 2026-04-20");
    // Block lines must not be disturbed.
    expect(updated).toContain("- **Blocked**: needs-user-approval");

    // Re-parse the enriched file and confirm the parser extracts the research
    // text with the heading preserved on the first line.
    const refreshed = parseTasksContent(updated, filePath);
    expect(refreshed[0].metadata.research).toBe(
      "2026-04-20 — draft message\nDraft sampled from prior releases."
    );
    expect(refreshed[0].metadata.lastEnriched).toBe("2026-04-20");
  });

  it("appends a new dated subheading when **Research** already exists", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Post release notes in Slack",
        "  - **ID**: slack-release",
        "  - **Blocked**: needs-user-approval — posting publicly as the user",
        "  - **Research**: 2026-04-10 — initial draft",
        "    First draft of the announcement.",
        "  - **Last-enriched**: 2026-04-10",
        "",
      ].join("\n")
    );

    const result = await enrichTask(taskFiles, "slack-release", {
      research: "Added rollout timing + crosspost channel.",
      date: "2026-04-20",
      label: "updated draft",
    });

    expect(result.isError).toBeUndefined();
    const updated = await readFile(filePath, "utf-8");
    // Original dated subheading preserved.
    expect(updated).toContain("- **Research**: 2026-04-10 — initial draft");
    expect(updated).toContain("    First draft of the announcement.");
    // New dated subheading appended as an indented continuation.
    expect(updated).toContain("    2026-04-20 — updated draft");
    expect(updated).toContain("    Added rollout timing + crosspost channel.");
    // Last-enriched is rewritten to the new date.
    expect(updated).toContain("- **Last-enriched**: 2026-04-20");
    expect(updated).not.toContain("- **Last-enriched**: 2026-04-10");

    // Parser must still produce a contiguous research string.
    const refreshed = parseTasksContent(updated, filePath);
    expect(refreshed[0].metadata.research).toContain("2026-04-10 — initial draft");
    expect(refreshed[0].metadata.research).toContain("2026-04-20 — updated draft");
  });

  it("prefers an exact ID over an earlier summary substring match", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Summary mentions exact-target",
        "  - **ID**: summary-collision",
        "",
        "- [ ] Exact ID target",
        "  - **ID**: exact-target",
        "",
      ].join("\n")
    );

    const result = await enrichTask(taskFiles, "exact-target", {
      research: "Resolved the summary collision.",
      date: "2026-04-20",
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Enriched "Exact ID target"');

    const updated = await readFile(filePath, "utf-8");
    const summaryTaskIndex = updated.indexOf("- [ ] Summary mentions exact-target");
    const exactTaskIndex = updated.indexOf("- [ ] Exact ID target");
    const researchIndex = updated.indexOf("- **Research**: 2026-04-20");
    expect(summaryTaskIndex).toBeGreaterThanOrEqual(0);
    expect(exactTaskIndex).toBeGreaterThan(summaryTaskIndex);
    expect(researchIndex).toBeGreaterThan(exactTaskIndex);
  });

  it("never touches the **Blocked** or **Blocked by** lines", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P0",
        "",
        "- [ ] Prepare release",
        "  - **ID**: prepare-release",
        "",
        "## P1",
        "",
        "- [ ] Ship release to production",
        "  - **ID**: ship-prod",
        "  - **Blocked by**: prepare-release",
        "  - **Blocked**: needs-credentials — prod deploy token not yet provisioned",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "ship-prod", {
      research: "Consumer sketch: read token from env, sign requests with HMAC.",
      date: "2026-04-20",
    });

    const updated = await readFile(filePath, "utf-8");
    // Blocked metadata must stay exactly as it was.
    expect(updated).toContain("- **Blocked by**: prepare-release");
    expect(updated).toContain(
      "- **Blocked**: needs-credentials — prod deploy token not yet provisioned"
    );
    // New enrichment must be present too.
    expect(updated).toContain("- **Research**:");
    expect(updated).toContain("- **Last-enriched**: 2026-04-20");
  });

  it("extends **Files** with de-duplicated paths when add_files is provided", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Ship release",
        "  - **ID**: ship",
        "  - **Files**: `src/release.ts`, `src/deploy.ts`",
        "  - **Blocked**: needs-credentials — ...",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "ship", {
      research: "Found the rollback helper in runbooks/.",
      date: "2026-04-20",
      add_files: "runbooks/rate-limiter.md, src/release.ts",
    });

    const updated = await readFile(filePath, "utf-8");
    // Existing files preserved, new file appended, duplicate (src/release.ts) not re-added.
    expect(updated).toMatch(
      /- \*\*Files\*\*: `src\/release\.ts`, `src\/deploy\.ts`, `runbooks\/rate-limiter\.md`/
    );
  });

  it("inserts a new **Files** line before Blocked / Research when the field is missing", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Ship release",
        "  - **ID**: ship",
        "  - **Details**: Ship the release.",
        "  - **Blocked**: needs-credentials — ...",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "ship", {
      research: "Discovered the rollback runbook.",
      date: "2026-04-20",
      add_files: "runbooks/rate-limiter.md",
    });

    const updated = await readFile(filePath, "utf-8");
    // Files must be inserted after the author-intent metadata (ID, Details)
    // and before **Blocked** so the field ordering stays readable.
    const idIdx = updated.indexOf("- **ID**: ship");
    const filesIdx = updated.indexOf("- **Files**:");
    const blockedIdx = updated.indexOf("- **Blocked**:");
    expect(filesIdx).toBeGreaterThan(idIdx);
    expect(filesIdx).toBeLessThan(blockedIdx);
  });

  it("appends to **Acceptance** without overwriting author lines", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Ship release",
        "  - **ID**: ship",
        "  - **Acceptance**: All tests pass.",
        "  - **Blocked**: needs-credentials — ...",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "ship", {
      research: "Added a rollout-timing acceptance criterion.",
      date: "2026-04-20",
      add_acceptance: "Rollout completes within 15 minutes of merge.",
    });

    const updated = await readFile(filePath, "utf-8");
    // Author line preserved.
    expect(updated).toContain("- **Acceptance**: All tests pass.");
    // New agent line appended under the same field.
    expect(updated).toContain("    Rollout completes within 15 minutes of merge.");
  });

  it("creates parser-readable **Acceptance** when the field is missing", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Ship release",
        "  - **ID**: ship",
        "  - **Blocked**: needs-credentials — ...",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "ship", {
      research: "Added rollback acceptance criteria.",
      date: "2026-04-20",
      add_acceptance: "Rollback instructions are documented before deploy.",
    });

    const updated = await readFile(filePath, "utf-8");
    const refreshed = parseTasksContent(updated, filePath);
    expect(refreshed[0].metadata.acceptance).toBe(
      "Rollback instructions are documented before deploy."
    );
  });

  it("rejects empty research notes", async () => {
    const { taskFiles } = await seed(
      "# Tasks\n\n## P1\n\n- [ ] Post in Slack\n  - **ID**: slack\n  - **Blocked**: needs-user-approval — ...\n"
    );

    const result = await enrichTask(taskFiles, "slack", {
      research: "   ",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/non-empty research/);
  });

  it("rejects non-ISO date strings", async () => {
    const { taskFiles } = await seed(
      "# Tasks\n\n## P1\n\n- [ ] Post in Slack\n  - **ID**: slack\n  - **Blocked**: needs-user-approval — ...\n"
    );

    const result = await enrichTask(taskFiles, "slack", {
      research: "Notes",
      date: "yesterday",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Invalid date/);
  });

  it("returns an error when the task cannot be found", async () => {
    const { taskFiles } = await seed(
      "# Tasks\n\n## P1\n\n- [ ] Existing\n  - **ID**: existing\n"
    );

    const result = await enrichTask(taskFiles, "missing-task", {
      research: "Notes",
      date: "2026-04-20",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No task found/);
  });

  it("leaves the task reason-blocked so /next-task skips it on the next pick", async () => {
    const { filePath, taskFiles } = await seed(
      [
        "# Tasks",
        "",
        "## P0",
        "",
        "- [ ] Post in Slack",
        "  - **ID**: slack-post",
        "  - **Blocked**: needs-user-approval — posting publicly as the user",
        "",
        "- [ ] Unblock-able task",
        "  - **ID**: fallback",
        "",
      ].join("\n")
    );

    await enrichTask(taskFiles, "slack-post", {
      research: "Draft text + recipients.",
      date: "2026-04-20",
    });

    // Re-parse from disk and feed pickTask — the enriched task must still be skipped.
    const contents = await readFile(filePath, "utf-8");
    const refreshedFiles: TaskFile[] = [
      { path: filePath, tasks: parseTasksContent(contents, filePath) },
    ];
    const picked = await pickTask(refreshedFiles);
    const data = JSON.parse(picked.text);
    expect(data.task.summary).toBe("Unblock-able task");
  });
});
