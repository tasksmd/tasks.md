import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTasksContent, type TaskFile } from "@tasks-md/parser";
import { pickBestTask } from "./lib.js";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function makeTaskFiles(content: string, path = "TASKS.md"): TaskFile[] {
  return [{ path, tasks: parseTasksContent(content, path) }];
}

describe("pickBestTask", () => {
  it("picks highest priority unblocked task", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Critical fix", "",
        "## P1", "",
        "- [ ] Feature work", "",
      ].join("\n")
    );
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Critical fix");
    expect(result!.task.priority).toBe("P0");
  });

  it("skips blocked tasks", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Blocker task",
        "  - **ID**: blocker", "",
        "- [ ] Blocked task",
        "  - **Blocked by**: blocker", "",
        "## P1", "",
        "- [ ] Available task", "",
      ].join("\n")
    );
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    // Picks "Blocker task" (P0, unblocked) over "Blocked task" (P0, blocked) and "Available task" (P1)
    expect(result!.task.summary).toBe("Blocker task");
  });

  it("skips claimed tasks", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Claimed task (@someone)", "",
        "## P1", "",
        "- [ ] Free task", "",
      ].join("\n")
    );
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Free task");
  });

  it("skips standing-loop tasks during automatic selection", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Refill the queue",
        "  - **ID**: standing-audit-gap-loop",
        "  - **Tags**: standing-loop, audit-only", "",
        "## P1", "",
        "- [ ] Normal task", "",
      ].join("\n")
    );
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Normal task");
  });

  it("returns undefined for empty queue", () => {
    const files = makeTaskFiles("# Tasks\n\n## P1\n");
    expect(pickBestTask(files)).toBeUndefined();
  });

  it("returns undefined when all tasks are claimed", () => {
    const files = makeTaskFiles(
      "# Tasks\n\n## P1\n\n- [ ] Task (@agent)\n"
    );
    expect(pickBestTask(files)).toBeUndefined();
  });

  it("prefers tasks that unblock others", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P1", "",
        "- [ ] Regular task", "",
        "- [ ] Unblocking task",
        "  - **ID**: unblocker", "",
        "- [ ] Depends on unblocker",
        "  - **Blocked by**: unblocker", "",
      ].join("\n")
    );
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Unblocking task");
    expect(result!.unblocksCount).toBe(1);
  });

  it("filters by tags", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Backend task",
        "  - **Tags**: backend", "",
        "## P1", "",
        "- [ ] Frontend task",
        "  - **Tags**: frontend", "",
      ].join("\n")
    );
    const result = pickBestTask(files, ["frontend"]);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Frontend task");
  });

  it("falls back to all candidates when no tag matches", () => {
    const files = makeTaskFiles(
      [
        "# Tasks", "",
        "## P1", "",
        "- [ ] Only task",
        "  - **Tags**: backend", "",
      ].join("\n")
    );
    const result = pickBestTask(files, ["nonexistent"]);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Only task");
  });

  it("works across multiple files", () => {
    const files: TaskFile[] = [
      {
        path: "a.md",
        tasks: parseTasksContent(
          "# Tasks\n\n## P1\n\n- [ ] Task A\n  - **ID**: task-a\n",
          "a.md"
        ),
      },
      {
        path: "b.md",
        tasks: parseTasksContent(
          "# Tasks\n\n## P0\n\n- [ ] Task B\n",
          "b.md"
        ),
      },
    ];
    const result = pickBestTask(files);
    expect(result).toBeDefined();
    expect(result!.task.summary).toBe("Task B");
  });
});

describe("CLI", () => {
  it("shows help with --help", () => {
    const result = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/lint/);
    expect(result.stdout).toMatch(/pick/);
    expect(result.stdout).toMatch(/stats/);
    expect(result.stdout).toMatch(/diff/);
  });

  it("lint validates a valid file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Test\n");
    try {
      const result = spawnSync("node", [CLI, "lint", join(dir, "TASKS.md")], {
        encoding: "utf-8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/0 error/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("lint fails on invalid file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Not Tasks\n");
    try {
      const result = spawnSync("node", [CLI, "lint", join(dir, "TASKS.md")], {
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/first line must be/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick works with a valid TASKS.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Do something\n  - **ID**: do-it\n"
    );
    // Need a git repo for discoverTaskFiles
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "."], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Picked "Do something"/);
      expect(result.stdout).toMatch(/ID: do-it/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick skips standing-loop tasks", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Refill the queue",
        "  - **ID**: standing-audit-gap-loop",
        "  - **Tags**: standing-loop, audit-only", "",
        "## P1", "",
        "- [ ] Do normal work",
        "  - **ID**: normal-work", "",
      ].join("\n")
    );
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "."], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Picked "Do normal work"/);
      expect(result.stdout).toMatch(/ID: normal-work/);
      expect(result.stdout).not.toMatch(/standing-audit-gap-loop/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick reports empty queue", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n");
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/No eligible tasks/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("watch --help advertises the --fix flag", () => {
    const result = spawnSync("node", [CLI, "watch", "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--fix/);
    expect(result.stdout).toMatch(/[Aa]uto-fix/);
  });

  it("--help lists sync once (unified surface)", () => {
    const result = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    // The unified `sync` command appears exactly once in the top-level command list.
    const syncMatches = result.stdout.match(/^\s*sync\b/gm) ?? [];
    expect(syncMatches).toHaveLength(1);
    // Legacy commands are hidden from `--help` (still callable but not advertised).
    expect(result.stdout).not.toMatch(/^\s*sync-issues\b/m);
    expect(result.stdout).not.toMatch(/^\s*sync-jira\b/m);
    expect(result.stdout).not.toMatch(/^\s*sync-linear\b/m);
  });

  it("sync --help advertises github/jira/linear subcommands", () => {
    const result = spawnSync("node", [CLI, "sync", "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/github\b/);
    expect(result.stdout).toMatch(/jira\b/);
    expect(result.stdout).toMatch(/linear\b/);
  });

  it("sync github --help is accepted with provider flags", () => {
    const result = spawnSync("node", [CLI, "sync", "github", "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--repo/);
    expect(result.stdout).toMatch(/--label/);
    expect(result.stdout).toMatch(/--merge/);
  });

  it("sync linear requires --team", () => {
    const result = spawnSync("node", [CLI, "sync", "linear"], { encoding: "utf-8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/required option .*--team/);
  });

  it("sync-issues alias prints deprecation warning and forwards", () => {
    // No GitHub auth available in test env, but the deprecation warning fires
    // before the action does any work — assert on stderr.
    const result = spawnSync("node", [CLI, "sync-issues", "--label", "__no_such_label__"], {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    expect(result.stderr).toMatch(/tasks sync-issues is deprecated; use tasks sync github/);
  });

  it("sync-jira alias prints deprecation warning", () => {
    const result = spawnSync("node", [CLI, "sync-jira", "--project", "__none__"], {
      encoding: "utf-8",
      timeout: 15000,
    });
    expect(result.stderr).toMatch(/tasks sync-jira is deprecated; use tasks sync jira/);
  });

  it("sync-linear alias prints deprecation warning", () => {
    const result = spawnSync("node", [CLI, "sync-linear", "--team", "__none__"], {
      encoding: "utf-8",
      timeout: 15000,
    });
    expect(result.stderr).toMatch(/tasks sync-linear is deprecated; use tasks sync linear/);
  });

  it("watch --fix is accepted (no commander error on unknown option)", () => {
    // `tasks watch` runs forever, but Commander rejects unknown options before
    // entering the action handler. Pointing watch at a non-existent directory
    // forces a fast exit (code 1, "No TASKS.md files found"), which lets us
    // assert the flag is accepted without leaving a watcher running.
    const cwd = mkdtempSync(join(tmpdir(), "tasks-watch-fix-cwd-"));
    try {
      const result = spawnSync("node", [CLI, "watch", "--fix", "no-such-subdir"], {
        encoding: "utf-8",
        cwd,
        timeout: 5000,
      });
      // Commander unknown-option exit code is 1 with "unknown option" stderr;
      // our fast-fail path is also exit 1 but with "No TASKS.md files found".
      // Distinguish by stderr content.
      expect(result.stderr).not.toMatch(/unknown option/i);
      expect(result.stderr).toMatch(/No TASKS\.md files found/);
    } finally {
      rmSync(cwd, { recursive: true });
    }
  });
});
