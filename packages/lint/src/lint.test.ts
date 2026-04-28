import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
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

  describe("**Blocked** reason validation", () => {
    it("passes a task blocked with a real reason", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Post release notes in Slack",
          "  - **ID**: slack-release",
          "  - **Blocked**: needs-user-approval — posting publicly as the user requires explicit approval",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("fails on an empty **Blocked** line", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Blocked**:",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Blocked\*\* must have a non-empty reason/);
    });

    it("fails on a whitespace-only **Blocked** line", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Blocked**:    ",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Blocked\*\* must have a non-empty reason/);
    });

    it("allows **Blocked** and **Blocked by** on the same task", () => {
      const result = lint(
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
          "- [ ] Ship release",
          "  - **Blocked by**: prepare-release",
          "  - **Blocked**: needs-credentials — prod deploy token not yet provisioned",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe("**Research** and **Last-enriched** validation", () => {
    it("passes a task with research notes and a valid ISO date", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Post release in Slack",
          "  - **ID**: slack-release",
          "  - **Blocked**: needs-user-approval — posting publicly as the user",
          "  - **Research**: Drafted announcement text; recipients = #eng-announcements.",
          "  - **Last-enriched**: 2026-04-20",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("supports multiline **Research** values", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Post release in Slack",
          "  - **Research**: 2026-04-20 — draft",
          "    First line of the draft.",
          "    Second line with context from git log.",
          "  - **Last-enriched**: 2026-04-20",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("fails on an empty **Research** line", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Research**:",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Research\*\* must have a non-empty value/);
    });

    it("fails on a whitespace-only **Research** line", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Research**:    ",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Research\*\* must have a non-empty value/);
    });

    it("fails on an empty **Last-enriched** line", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Last-enriched**:",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Last-enriched\*\* must be an ISO date/);
    });

    it("fails when **Last-enriched** is not an ISO date", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Ship release",
          "  - **Last-enriched**: yesterday",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\*\*Last-enriched\*\* must be an ISO date \(YYYY-MM-DD\), got 'yesterday'/);
    });

    it("accepts an enriched, blocked task that keeps the block intact", () => {
      const result = lint(
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
          "  - **Research**: 2026-04-20 — consumer sketch and rollout steps drafted.",
          "  - **Last-enriched**: 2026-04-20",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
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

  describe("policy validation", () => {
    it("passes a file with valid file-level policy", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "<!-- policy: Always run tests. -->",
          "",
          "## P1",
          "",
          "- [ ] Do something",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("passes a file with valid section-level policy", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "<!-- policy: P1 tasks need a ticket. -->",
          "",
          "- [ ] Add feature",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("passes a file with multiple policies in one comment", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "<!-- policy: Rule one.",
          "     policy: Rule two. -->",
          "",
          "## P1",
          "",
          "- [ ] Task",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
    });

    it("fails on policy directive outside HTML comment", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "policy: This is not in a comment.",
          "",
          "## P1",
          "",
          "- [ ] Task",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/policy directive found outside HTML comment/);
    });

    it("fails on empty policy directive", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "<!-- policy: -->",
          "",
          "## P1",
          "",
          "- [ ] Task",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/empty text/);
    });

    it("fails on unclosed HTML comment", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "<!-- policy: This comment never closes",
          "",
          "## P1",
          "",
          "- [ ] Task",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/unclosed HTML comment/);
    });

    it("does not flag policy text in task metadata", () => {
      const result = lint(
        [
          "# Tasks",
          "",
          "## P1",
          "",
          "- [ ] Update policy: documentation",
          "  - **Details**: The policy: prefix in metadata is fine.",
          "",
        ].join("\n")
      );
      expect(result.exitCode).toBe(0);
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
