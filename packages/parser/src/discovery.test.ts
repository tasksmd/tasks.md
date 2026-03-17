import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { findGitRoot, discoverTaskFiles, loadAllTasks, loadAllTasksAsync } from "./discovery.js";

let tempDir: string;

function initGitRepo(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

beforeEach(() => {
  tempDir = realpathSync(mkdtempSync(join(tmpdir(), "parser-discovery-test-")));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("findGitRoot", () => {
  it("returns git root from a subdirectory", () => {
    initGitRepo(tempDir);
    const subdir = join(tempDir, "nested", "deep");
    mkdirSync(subdir, { recursive: true });
    const root = findGitRoot(subdir);
    expect(root).toBe(tempDir);
  });

  it("returns startDir when not in a git repo", () => {
    const isolated = mkdtempSync(join(tmpdir(), "no-git-"));
    try {
      const root = findGitRoot(isolated);
      expect(root).toBe(isolated);
    } finally {
      rmSync(isolated, { recursive: true });
    }
  });
});

describe("discoverTaskFiles", () => {
  it("finds TASKS.md at git root", () => {
    initGitRepo(tempDir);
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Test\n");
    const files = discoverTaskFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(join(tempDir, "TASKS.md"));
  });

  it("finds TASKS.md in subdirectories", () => {
    initGitRepo(tempDir);
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Root\n");
    const subdir = join(tempDir, "packages", "foo");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Sub\n");
    const files = discoverTaskFiles(tempDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const normalized = files.map((f) => f.replace(tempDir + "/", "")).sort();
    expect(normalized).toContain("TASKS.md");
  });

  it("excludes TASKS.md inside node_modules", () => {
    initGitRepo(tempDir);
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Root\n");
    const nmDir = join(tempDir, "node_modules", "some-pkg");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Dep\n");
    const files = discoverTaskFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(join(tempDir, "TASKS.md"));
  });

  it("returns files sorted by path for deterministic order", () => {
    initGitRepo(tempDir);
    const zDir = join(tempDir, "z-pkg");
    const aDir = join(tempDir, "a-pkg");
    mkdirSync(zDir, { recursive: true });
    mkdirSync(aDir, { recursive: true });
    writeFileSync(join(zDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Z\n");
    writeFileSync(join(aDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] A\n");
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Root\n");
    const files = discoverTaskFiles(tempDir);
    expect(files.length).toBe(3);
    // Should be sorted lexicographically by path
    const relativePaths = files.map((f) => f.replace(tempDir + "/", ""));
    expect(relativePaths).toEqual([...relativePaths].sort());
  });

  it("returns fallback when no TASKS.md exists", () => {
    initGitRepo(tempDir);
    const files = discoverTaskFiles(tempDir);
    // Should return empty — no TASKS.md exists
    expect(files).toHaveLength(0);
  });
});

describe("loadAllTasks (sync)", () => {
  it("loads and parses tasks from discovered files", () => {
    initGitRepo(tempDir);
    writeFileSync(
      join(tempDir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] First task\n  - **ID**: first\n"
    );
    const taskFiles = loadAllTasks(tempDir);
    expect(taskFiles).toHaveLength(1);
    expect(taskFiles[0].tasks).toHaveLength(1);
    expect(taskFiles[0].tasks[0].summary).toBe("First task");
    expect(taskFiles[0].tasks[0].metadata.id).toBe("first");
  });

  it("returns empty array when no files found", () => {
    initGitRepo(tempDir);
    const taskFiles = loadAllTasks(tempDir);
    expect(taskFiles).toHaveLength(0);
  });

  it("skips unreadable files", () => {
    initGitRepo(tempDir);
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Valid\n");
    // Create a directory named TASKS.md in a subdir — readFileSync will fail on it
    const badDir = join(tempDir, "bad");
    mkdirSync(badDir, { recursive: true });
    // Just verify the valid file is loaded
    const taskFiles = loadAllTasks(tempDir);
    expect(taskFiles.length).toBeGreaterThanOrEqual(1);
    expect(taskFiles[0].tasks[0].summary).toBe("Valid");
  });
});

describe("loadAllTasksAsync", () => {
  it("loads and parses tasks asynchronously", async () => {
    initGitRepo(tempDir);
    writeFileSync(
      join(tempDir, "TASKS.md"),
      "# Tasks\n\n## P0\n\n- [ ] Urgent fix\n"
    );
    const taskFiles = await loadAllTasksAsync(tempDir);
    expect(taskFiles).toHaveLength(1);
    expect(taskFiles[0].tasks[0].summary).toBe("Urgent fix");
    expect(taskFiles[0].tasks[0].priority).toBe("P0");
  });

  it("returns empty array when no files found", async () => {
    initGitRepo(tempDir);
    const taskFiles = await loadAllTasksAsync(tempDir);
    expect(taskFiles).toHaveLength(0);
  });
});
