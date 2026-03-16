import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTasksContent, type TaskFile } from "./parser.js";
import {
  listTasksFromFiles,
  claimTask,
  completeTask,
  addTask,
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
