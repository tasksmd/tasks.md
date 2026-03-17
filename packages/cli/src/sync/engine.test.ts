import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateTasksMarkdown, mergeIntoExisting, runSync } from "./engine.js";
import type { SyncIssue, SyncSource } from "./types.js";

describe("generateTasksMarkdown", () => {
  it("generates empty file with P2 section when no issues", () => {
    const result = generateTasksMarkdown([]);
    expect(result).toContain("# Tasks");
    expect(result).toContain("## P2");
  });

  it("generates tasks grouped by priority", () => {
    const issues: SyncIssue[] = [
      { id: "issue-1", title: "Critical bug", priority: 0, tags: [] },
      { id: "issue-2", title: "Feature request", priority: 2, tags: ["frontend"] },
      { id: "issue-3", title: "Nice to have", priority: 3, tags: ["docs", "api"] },
    ];
    const result = generateTasksMarkdown(issues);

    expect(result).toContain("## P0");
    expect(result).toContain("- [ ] Critical bug");
    expect(result).toContain("  - **ID**: issue-1");

    expect(result).toContain("## P2");
    expect(result).toContain("- [ ] Feature request");
    expect(result).toContain("  - **Tags**: frontend");

    expect(result).toContain("## P3");
    expect(result).toContain("- [ ] Nice to have");
    expect(result).toContain("  - **Tags**: docs, api");

    // P0 should come before P2
    expect(result.indexOf("## P0")).toBeLessThan(result.indexOf("## P2"));
  });

  it("clamps priority to 0-3 range", () => {
    const issues: SyncIssue[] = [
      { id: "test-1", title: "Negative priority", priority: -1, tags: [] },
      { id: "test-2", title: "Over max", priority: 5, tags: [] },
    ];
    const result = generateTasksMarkdown(issues);
    expect(result).toContain("## P0");
    expect(result).toContain("## P3");
    expect(result).toContain("- [ ] Negative priority");
    expect(result).toContain("- [ ] Over max");
  });

  it("omits Tags line when no tags", () => {
    const issues: SyncIssue[] = [
      { id: "issue-1", title: "No tags", priority: 1, tags: [] },
    ];
    const result = generateTasksMarkdown(issues);
    expect(result).not.toContain("**Tags**");
  });
});

describe("mergeIntoExisting", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sync-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates new file when target does not exist", () => {
    const target = join(tempDir, "TASKS.md");
    const issues: SyncIssue[] = [
      { id: "issue-10", title: "New task", priority: 1, tags: [] },
    ];
    mergeIntoExisting(target, issues, "issue-");
    const content = readFileSync(target, "utf-8");
    expect(content).toContain("# Tasks");
    expect(content).toContain("- [ ] New task");
  });

  it("preserves manual tasks when merging", () => {
    const target = join(tempDir, "TASKS.md");
    writeFileSync(
      target,
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Manual task I wrote by hand",
        "",
        "- [ ] Old synced task",
        "  - **ID**: issue-5",
        "  - **Tags**: stale",
        "",
      ].join("\n"),
      "utf-8"
    );

    const issues: SyncIssue[] = [
      { id: "issue-10", title: "New synced task", priority: 1, tags: ["fresh"] },
    ];
    mergeIntoExisting(target, issues, "issue-");

    const content = readFileSync(target, "utf-8");
    expect(content).toContain("- [ ] Manual task I wrote by hand");
    expect(content).not.toContain("Old synced task");
    expect(content).toContain("- [ ] New synced task");
    expect(content).toContain("  - **ID**: issue-10");
  });

  it("adds priority sections that do not exist", () => {
    const target = join(tempDir, "TASKS.md");
    writeFileSync(target, "# Tasks\n\n## P2\n\n- [ ] Existing\n", "utf-8");

    const issues: SyncIssue[] = [
      { id: "issue-1", title: "Urgent", priority: 0, tags: [] },
    ];
    mergeIntoExisting(target, issues, "issue-");

    const content = readFileSync(target, "utf-8");
    expect(content).toContain("## P0");
    expect(content).toContain("- [ ] Urgent");
    expect(content).toContain("- [ ] Existing");
    // P0 should come before P2
    expect(content.indexOf("## P0")).toBeLessThan(content.indexOf("## P2"));
  });

  it("removes stale synced tasks (closed issues)", () => {
    const target = join(tempDir, "TASKS.md");
    writeFileSync(
      target,
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] Will be removed",
        "  - **ID**: issue-99",
        "",
        "- [ ] Will stay",
        "  - **ID**: issue-100",
        "",
      ].join("\n"),
      "utf-8"
    );

    // Only issue-100 in new sync — issue-99 was closed
    const issues: SyncIssue[] = [
      { id: "issue-100", title: "Will stay updated", priority: 1, tags: [] },
    ];
    mergeIntoExisting(target, issues, "issue-");

    const content = readFileSync(target, "utf-8");
    expect(content).not.toContain("issue-99");
    expect(content).toContain("issue-100");
    expect(content).toContain("Will stay updated");
  });

  it("does not remove tasks from other sources", () => {
    const target = join(tempDir, "TASKS.md");
    writeFileSync(
      target,
      [
        "# Tasks",
        "",
        "## P1",
        "",
        "- [ ] GitHub task",
        "  - **ID**: issue-1",
        "",
        "- [ ] Jira task",
        "  - **ID**: jira-PROJ-1",
        "",
      ].join("\n"),
      "utf-8"
    );

    const issues: SyncIssue[] = [
      { id: "issue-2", title: "Updated GitHub task", priority: 1, tags: [] },
    ];
    // Syncing GitHub issues should not touch Jira tasks
    mergeIntoExisting(target, issues, "issue-");

    const content = readFileSync(target, "utf-8");
    expect(content).toContain("jira-PROJ-1");
    expect(content).toContain("issue-2");
    expect(content).not.toContain("issue-1");
  });
});

describe("runSync", () => {
  it("writes to stdout when no output specified", async () => {
    const writes: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    const source: SyncSource = {
      name: "Test",
      idPrefix: "test-",
      async fetchIssues() {
        return [{ id: "test-1", title: "Test task", priority: 1, tags: [] }];
      },
    };

    await runSync(source, {});
    process.stdout.write = originalWrite;

    const output = writes.join("");
    expect(output).toContain("# Tasks");
    expect(output).toContain("- [ ] Test task");
  });

  it("logs message when no issues found", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (msg: string) => errors.push(msg);

    const source: SyncSource = {
      name: "Empty",
      idPrefix: "empty-",
      async fetchIssues() {
        return [];
      },
    };

    await runSync(source, {});
    console.error = originalError;

    expect(errors.some((e) => e.includes("No issues found"))).toBe(true);
  });
});
