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

  // Story 05 ("Each Team Member Has Their Own Queue") sells nested
  // `TASKS.md` files across packages as a first-class workflow. This test
  // pins the monorepo discovery shape end-to-end: top-level + two sibling
  // packages are all discovered, a `node_modules` decoy is excluded, and
  // the returned set is exactly the three-file expectation
  // (top + 2 packages, no decoy), not just `>= 3`.
  it("discovers a full monorepo shape (top + two packages, excludes node_modules)", () => {
    writeFileSync(join(tempDir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Repo-wide cleanup\n");

    mkdirSync(join(tempDir, "packages", "foo"), { recursive: true });
    writeFileSync(join(tempDir, "packages", "foo", "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Foo work\n");

    mkdirSync(join(tempDir, "packages", "bar"), { recursive: true });
    writeFileSync(join(tempDir, "packages", "bar", "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Bar work\n");

    // Decoy that must NOT be discovered.
    mkdirSync(join(tempDir, "node_modules", "baz"), { recursive: true });
    writeFileSync(
      join(tempDir, "node_modules", "baz", "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Vendor task — must be ignored\n"
    );

    const files = discoverWatchFiles(tempDir);

    // Exactly three files — the decoy under `node_modules/` is excluded.
    expect(files).toHaveLength(3);
    expect(files.sort()).toEqual(
      [
        join(tempDir, "TASKS.md"),
        join(tempDir, "packages", "bar", "TASKS.md"),
        join(tempDir, "packages", "foo", "TASKS.md"),
      ].sort()
    );
    // Belt-and-suspenders: no entry references the decoy path.
    for (const file of files) {
      expect(file).not.toContain(join("node_modules", "baz"));
    }
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
