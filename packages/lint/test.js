#!/usr/bin/env node

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LINT = join(import.meta.dirname, "index.js");

function lint(content, filename = "TASKS.md") {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-test-"));
  const file = join(dir, filename);
  writeFileSync(file, content);
  try {
    const output = execFileSync("node", [LINT, file], {
      encoding: "utf-8",
      stderr: "pipe",
    });
    return { exitCode: 0, stdout: output, stderr: "" };
  } catch (error) {
    return {
      exitCode: error.status,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function lintMultiple(files) {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-test-"));
  const paths = [];
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    writeFileSync(file, content);
    paths.push(file);
  }
  try {
    const output = execFileSync("node", [LINT, ...paths], {
      encoding: "utf-8",
      stderr: "pipe",
    });
    return { exitCode: 0, stdout: output, stderr: "" };
  } catch (error) {
    return {
      exitCode: error.status,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

describe("tasks-lint", () => {
  describe("valid files", () => {
    it("passes a minimal valid file", () => {
      const result = lint("# Tasks\n\n## P1\n\n- [ ] Do something\n");
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /0 error/);
    });

    it("passes a file with all priority levels", () => {
      const result = lint(
        "# Tasks\n\n## P0\n\n- [ ] Critical\n\n## P1\n\n- [ ] High\n\n## P2\n\n- [ ] Medium\n\n## P3\n\n- [ ] Low\n"
      );
      assert.equal(result.exitCode, 0);
    });

    it("passes a file with metadata", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P0",
          "",
          "- [ ] Fix auth crash",
          "  - **ID**: auth-fix",
          "  - **Tags**: backend, auth",
          "  - **Details**: JWT refresh returns 500",
          "  - **Files**: `src/auth.ts`, `src/middleware.ts`",
          "  - **Acceptance**: Tests pass",
          "",
        ].join("\n")
      );
      assert.equal(result.exitCode, 0);
    });

    it("passes a file with subtasks", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Refactor module",
          "  - **ID**: refactor",
          "  - [ ] Extract logic",
          "  - [ ] Add tests",
          "",
        ].join("\n")
      );
      assert.equal(result.exitCode, 0);
    });

    it("passes a file with valid blocker references", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P0",
          "",
          "- [ ] Set up DB",
          "  - **ID**: setup-db",
          "",
          "## P1",
          "",
          "- [ ] Build API",
          "  - **Blocked by**: setup-db",
          "",
        ].join("\n")
      );
      assert.equal(result.exitCode, 0);
    });

    it("passes an empty task queue", () => {
      const result = lint("# Tasks\n\n## P1\n");
      assert.equal(result.exitCode, 0);
    });

    it("passes a file with claimed tasks", () => {
      const result = lint(
        "# Tasks\n\n## P1\n\n- [ ] Do work (@cascade)\n"
      );
      assert.equal(result.exitCode, 0);
    });
  });

  describe("structural errors", () => {
    it("fails when first line is not # Tasks", () => {
      const result = lint("# TODO\n\n## P1\n\n- [ ] Something\n");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /first line must be '# Tasks'/);
    });

    it("fails on empty file", () => {
      const result = lint("");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /first line must be '# Tasks'/);
    });

    it("fails on task before any priority heading", () => {
      const result = lint("# Tasks\n\n- [ ] Orphan task\n");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /task found before any priority heading/);
    });

    it("fails on non-checkbox list item under priority", () => {
      const result = lint("# Tasks\n\n## P1\n\n- Something without checkbox\n");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /must use checkbox format/);
    });

    it("fails on completed (checked) tasks", () => {
      const result = lint("# Tasks\n\n## P1\n\n- [x] Done task\n");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /completed task should be removed/);
    });
  });

  describe("priority errors", () => {
    it("fails on out-of-order priorities", () => {
      const result = lint(
        "# Tasks\n\n## P2\n\n- [ ] Medium\n\n## P1\n\n- [ ] High\n"
      );
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /out of order/);
    });

    it("fails on invalid priority P4+", () => {
      const result = lint("# Tasks\n\n## P5\n\n- [ ] Something\n");
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /invalid priority heading/);
    });
  });

  describe("ID validation", () => {
    it("fails on non-kebab-case ID", () => {
      const result = lint(
        "# Tasks\n\n## P1\n\n- [ ] Fix bug\n  - **ID**: Fix_Bug\n"
      );
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /must be kebab-case/);
    });

    it("fails on duplicate IDs within a file", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] First",
          "  - **ID**: my-task",
          "",
          "- [ ] Second",
          "  - **ID**: my-task",
          "",
        ].join("\n")
      );
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /duplicate ID/);
    });
  });

  describe("blocker validation", () => {
    it("fails on unknown blocker reference", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Build thing",
          "  - **Blocked by**: nonexistent-task",
          "",
        ].join("\n")
      );
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /unknown ID 'nonexistent-task'/);
    });
  });

  describe("cross-file validation", () => {
    it("detects duplicate IDs across files", () => {
      const result = lintMultiple({
        "a.md": "# Tasks\n\n## P1\n\n- [ ] Task A\n  - **ID**: shared-id\n",
        "b.md": "# Tasks\n\n## P1\n\n- [ ] Task B\n  - **ID**: shared-id\n",
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /duplicate ID/);
    });

    it("resolves blockers across files", () => {
      const result = lintMultiple({
        "a.md": "# Tasks\n\n## P0\n\n- [ ] Setup\n  - **ID**: setup\n",
        "b.md":
          "# Tasks\n\n## P1\n\n- [ ] Build\n  - **Blocked by**: setup\n",
      });
      assert.equal(result.exitCode, 0);
    });
  });

  describe("CLI behavior", () => {
    it("exits 2 with no arguments", () => {
      try {
        execFileSync("node", [LINT], { encoding: "utf-8" });
        assert.fail("should have exited non-zero");
      } catch (error) {
        assert.equal(error.status, 2);
      }
    });

    it("exits 2 for nonexistent file", () => {
      try {
        execFileSync("node", [LINT, "/tmp/nonexistent-tasks-file.md"], {
          encoding: "utf-8",
        });
        assert.fail("should have exited non-zero");
      } catch (error) {
        assert.equal(error.status, 2);
      }
    });

    it("can lint a directory of files", () => {
      const dir = mkdtempSync(join(tmpdir(), "tasks-lint-dir-"));
      writeFileSync(
        join(dir, "a.md"),
        "# Tasks\n\n## P1\n\n- [ ] Task A\n"
      );
      writeFileSync(
        join(dir, "b.md"),
        "# Tasks\n\n## P1\n\n- [ ] Task B\n"
      );
      try {
        const output = execFileSync("node", [LINT, dir], {
          encoding: "utf-8",
        });
        assert.match(output, /2 file/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });
});
