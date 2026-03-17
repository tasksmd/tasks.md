import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function lint(content: string, filename = "TASKS.md") {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-test-"));
  const file = join(dir, filename);
  writeFileSync(file, content);
  try {
    const result = spawnSync("node", [CLI, file], { encoding: "utf-8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function lintMultiple(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-test-"));
  const paths: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    writeFileSync(file, content);
    paths.push(file);
  }
  try {
    const result = spawnSync("node", [CLI, ...paths], { encoding: "utf-8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

describe("tasks-lint", () => {
  describe("valid files", () => {
    it("passes a minimal valid file", () => {
      const result = lint("# Tasks\n\n## P1\n\n- [ ] Do something\n");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/0 error/);
    });

    it("passes a file with all priority levels", () => {
      const result = lint(
        "# Tasks\n\n## P0\n\n- [ ] Critical\n\n## P1\n\n- [ ] High\n\n## P2\n\n- [ ] Medium\n\n## P3\n\n- [ ] Low\n"
      );
      expect(result.exitCode).toBe(0);
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
      expect(result.exitCode).toBe(0);
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
      expect(result.exitCode).toBe(0);
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
      expect(result.exitCode).toBe(0);
    });

    it("passes an empty task queue", () => {
      const result = lint("# Tasks\n\n## P1\n");
      expect(result.exitCode).toBe(0);
    });

    it("passes a file with claimed tasks", () => {
      const result = lint(
        "# Tasks\n\n## P1\n\n- [ ] Do work (@cascade)\n"
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe("structural errors", () => {
    it("fails when first line is not # Tasks", () => {
      const result = lint("# TODO\n\n## P1\n\n- [ ] Something\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/first line must be '# Tasks'/);
    });

    it("fails on empty file", () => {
      const result = lint("");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/first line must be '# Tasks'/);
    });

    it("fails on task before any priority heading", () => {
      const result = lint("# Tasks\n\n- [ ] Orphan task\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/task found before any priority heading/);
    });

    it("fails on non-checkbox list item under priority", () => {
      const result = lint("# Tasks\n\n## P1\n\n- Something without checkbox\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/must use checkbox format/);
    });

    it("fails on completed (checked) tasks", () => {
      const result = lint("# Tasks\n\n## P1\n\n- [x] Done task\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/completed task should be removed/);
    });

    it("fails on completed tasks with uppercase [X]", () => {
      const result = lint("# Tasks\n\n## P1\n\n- [X] Done task\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/completed task should be removed/);
    });
  });

  describe("priority errors", () => {
    it("fails on out-of-order priorities", () => {
      const result = lint(
        "# Tasks\n\n## P2\n\n- [ ] Medium\n\n## P1\n\n- [ ] High\n"
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/out of order/);
    });

    it("fails on invalid priority P4+", () => {
      const result = lint("# Tasks\n\n## P5\n\n- [ ] Something\n");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/invalid priority heading/);
    });
  });

  describe("ID validation", () => {
    it("fails on non-kebab-case ID", () => {
      const result = lint(
        "# Tasks\n\n## P1\n\n- [ ] Fix bug\n  - **ID**: Fix_Bug\n"
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/must be kebab-case/);
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
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/duplicate ID/);
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
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/unknown ID 'nonexistent-task'/);
    });
  });

  describe("cross-file validation", () => {
    it("detects duplicate IDs across files", () => {
      const result = lintMultiple({
        "a.md": "# Tasks\n\n## P1\n\n- [ ] Task A\n  - **ID**: shared-id\n",
        "b.md": "# Tasks\n\n## P1\n\n- [ ] Task B\n  - **ID**: shared-id\n",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/duplicate ID/);
    });

    it("resolves blockers across files", () => {
      const result = lintMultiple({
        "a.md": "# Tasks\n\n## P0\n\n- [ ] Setup\n  - **ID**: setup\n",
        "b.md":
          "# Tasks\n\n## P1\n\n- [ ] Build\n  - **Blocked by**: setup\n",
      });
      expect(result.exitCode).toBe(0);
    });
  });

  describe("--fix mode", () => {
    it("removes completed tasks when --fix is used", () => {
      const dir = mkdtempSync(join(tmpdir(), "tasks-lint-fix-"));
      const file = join(dir, "TASKS.md");
      writeFileSync(
        file,
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [x] Done task",
          "  - **ID**: done-one",
          "",
          "- [ ] Active task",
          "",
        ].join("\n")
      );
      try {
        const result = spawnSync("node", [CLI, "--fix", file], {
          encoding: "utf-8",
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/removed completed task/);
        expect(result.stdout).toMatch(/fixed 1 issue/);

        const fixed = readFileSync(file, "utf-8");
        expect(fixed).not.toContain("Done task");
        expect(fixed).not.toContain("done-one");
        expect(fixed).toContain("- [ ] Active task");
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it("removes multiple completed tasks", () => {
      const dir = mkdtempSync(join(tmpdir(), "tasks-lint-fix-"));
      const file = join(dir, "TASKS.md");
      writeFileSync(
        file,
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [x] First done",
          "",
          "- [x] Second done",
          "  - **ID**: second",
          "",
          "- [ ] Still open",
          "",
        ].join("\n")
      );
      try {
        const result = spawnSync("node", [CLI, "--fix", file], {
          encoding: "utf-8",
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/fixed 2 issue/);

        const fixed = readFileSync(file, "utf-8");
        expect(fixed).not.toContain("First done");
        expect(fixed).not.toContain("Second done");
        expect(fixed).toContain("- [ ] Still open");
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it("exits 0 when fix resolves all errors", () => {
      const dir = mkdtempSync(join(tmpdir(), "tasks-lint-fix-"));
      const file = join(dir, "TASKS.md");
      writeFileSync(file, "# Tasks\n\n## P1\n\n- [x] Only task\n");
      try {
        const result = spawnSync("node", [CLI, "--fix", file], {
          encoding: "utf-8",
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/0 remaining error/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it("still reports non-fixable errors alongside fixes", () => {
      const dir = mkdtempSync(join(tmpdir(), "tasks-lint-fix-"));
      const file = join(dir, "TASKS.md");
      writeFileSync(
        file,
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [x] Completed task",
          "",
          "- [ ] Bad ID task",
          "  - **ID**: Bad_ID",
          "",
        ].join("\n")
      );
      try {
        const result = spawnSync("node", [CLI, "--fix", file], {
          encoding: "utf-8",
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/must be kebab-case/);
        expect(result.stdout).toMatch(/fixed 1 issue/);
        expect(result.stdout).toMatch(/1 remaining error/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });

  describe("CLI behavior", () => {
    it("exits 2 with no arguments", () => {
      const result = spawnSync("node", [CLI], { encoding: "utf-8" });
      expect(result.status).toBe(2);
    });

    it("exits 2 for nonexistent file", () => {
      const result = spawnSync("node", [CLI, "/tmp/nonexistent-tasks-file.md"], {
        encoding: "utf-8",
      });
      expect(result.status).toBe(2);
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
        const result = spawnSync("node", [CLI, dir], { encoding: "utf-8" });
        expect(result.stdout).toMatch(/2 file/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });
});
