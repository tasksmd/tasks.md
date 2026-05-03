import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverWatchFiles, lintTaskFile } from "./watch.js";

let tempDir: string;

beforeEach(() => {
  tempDir = realpathSync(mkdtempSync(join(tmpdir(), "tasks-watch-test-")));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("discoverWatchFiles", () => {
  it("finds TASKS.md files in directory", () => {
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Test\n");
    const files = discoverWatchFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("TASKS.md");
  });

  it("finds nested TASKS.md files", () => {
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Root\n");
    const subdir = join(tempDir, "packages", "foo");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Sub\n");
    const files = discoverWatchFiles(tempDir);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("excludes node_modules and .git", () => {
    mkdirSync(join(tempDir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(tempDir, "node_modules", "pkg", "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Bad\n");
    mkdirSync(join(tempDir, ".git", "info"), { recursive: true });
    writeFileSync(join(tempDir, ".git", "info", "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Bad\n");
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Good\n");
    const files = discoverWatchFiles(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("TASKS.md");
    expect(files[0]).not.toContain("node_modules");
  });

  it("returns empty when no TASKS.md found", () => {
    const files = discoverWatchFiles(tempDir);
    expect(files).toHaveLength(0);
  });
});

describe("lintTaskFile", () => {
  it("returns success for valid file", () => {
    const file = join(tempDir, "TASKS.md");
    writeFileSync(file, "# Tasks\n\n## P1\n\n- [ ] Valid task\n");
    const result = lintTaskFile(file);
    expect(result.success).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.fixed).toBe(0);
  });

  it("returns errors for invalid file", () => {
    const file = join(tempDir, "TASKS.md");
    writeFileSync(file, "not a valid tasks file\n");
    const result = lintTaskFile(file);
    expect(result.success).toBe(false);
    expect(result.errors).toBeGreaterThan(0);
  });

  it("does not auto-fix when fix flag is false (default)", () => {
    const file = join(tempDir, "TASKS.md");
    const before = "# Tasks\n\n## P1\n\n- [x] Done\n- [ ] Open\n";
    writeFileSync(file, before);
    const result = lintTaskFile(file);
    expect(result.fixed).toBe(0);
    // Completed task remains as a lint error, file unchanged
    expect(result.success).toBe(false);
    expect(readFileSync(file, "utf-8")).toBe(before);
  });

  it("auto-fixes removable issues when fix flag is true", () => {
    const file = join(tempDir, "TASKS.md");
    writeFileSync(file, "# Tasks\n\n## P1\n\n- [x] Done\n- [ ] Open\n");
    const result = lintTaskFile(file, true);
    expect(result.fixed).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
    expect(result.success).toBe(true);
    // Completed task removed; remaining tasks intact
    const after = readFileSync(file, "utf-8");
    expect(after).not.toMatch(/\[x\]/);
    expect(after).toMatch(/- \[ \] Open/);
  });
});
