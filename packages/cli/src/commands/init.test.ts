import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initTaskQueue } from "./init.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "tasks-init-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("initTaskQueue", () => {
  it("creates TASKS.md with standard structure", () => {
    const result = initTaskQueue(tempDir);
    const content = readFileSync(join(tempDir, "TASKS.md"), "utf-8");
    expect(content).toContain("# Tasks");
    expect(content).toContain("## P1");
    expect(content).toContain("## P2");
    expect(result.createdTasks).toBe(true);
  });

  it("skips when TASKS.md already exists", () => {
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P0\n\n- [ ] Existing\n");
    const result = initTaskQueue(tempDir);
    const content = readFileSync(join(tempDir, "TASKS.md"), "utf-8");
    expect(content).toContain("Existing");
    expect(result.createdTasks).toBe(false);
  });

  it("appends Task Management section to AGENTS.md", () => {
    writeFileSync(join(tempDir, "AGENTS.md"), "# AGENTS\n\nSome content.\n");
    const result = initTaskQueue(tempDir);
    const content = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("## Task Management");
    expect(content).toContain("Claim tasks by appending");
    expect(result.updatedAgents).toBe(true);
  });

  it("skips AGENTS.md when it already has Task Management section", () => {
    writeFileSync(
      join(tempDir, "AGENTS.md"),
      "# AGENTS\n\n## Task Management\n\nAlready here.\n"
    );
    const result = initTaskQueue(tempDir);
    const content = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
    expect(content).not.toContain("Claim tasks by appending");
    expect(result.updatedAgents).toBe(false);
  });

  it("skips AGENTS.md update when file does not exist", () => {
    const result = initTaskQueue(tempDir);
    expect(result.updatedAgents).toBe(false);
    expect(existsSync(join(tempDir, "AGENTS.md"))).toBe(false);
  });

  it("returns messages for each action taken", () => {
    writeFileSync(join(tempDir, "AGENTS.md"), "# AGENTS\n");
    const result = initTaskQueue(tempDir);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.messages.some((m) => m.includes("TASKS.md"))).toBe(true);
    expect(result.messages.some((m) => m.includes("AGENTS.md"))).toBe(true);
  });
});
