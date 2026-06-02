import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTasksContent, type TaskFile } from "@tasks-md/parser";
import { pickBestTask, listTasks } from "./lib.js";

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

describe("listTasks", () => {
  // Same filter contract as `packages/mcp/src/tools.ts:listTasksFromFiles`.
  // Update both in lockstep when changing filter behavior.
  const FIXTURE = [
    "# Tasks", "",
    "## P0", "",
    "- [ ] Critical fix",
    "  - **ID**: critical",
    "  - **Tags**: backend, auth", "",
    "## P1", "",
    "- [ ] Frontend feature (@cursor)",
    "  - **ID**: frontend",
    "  - **Tags**: frontend, ux", "",
    "- [ ] Blocked thing",
    "  - **ID**: blocked",
    "  - **Blocked by**: critical", "",
    "## P2", "",
    "- [ ] Loose task", "",
  ].join("\n");

  it("returns all tasks priority-sorted (P0 first)", () => {
    const tasks = listTasks(makeTaskFiles(FIXTURE));
    expect(tasks).toHaveLength(4);
    expect(tasks[0].summary).toBe("Critical fix");
    expect(tasks[0].priority).toBe("P0");
    expect(tasks[3].priority).toBe("P2");
  });

  it("filters by priority case-insensitively", () => {
    const result = listTasks(makeTaskFiles(FIXTURE), { priority: "p1" });
    expect(result.map((t) => t.summary)).toEqual([
      "Frontend feature",
      "Blocked thing",
    ]);
  });

  it("filters by tag case-insensitively", () => {
    const result = listTasks(makeTaskFiles(FIXTURE), { tag: "AUTH" });
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe("Critical fix");
  });

  it("filters unclaimed only", () => {
    const result = listTasks(makeTaskFiles(FIXTURE), { unclaimedOnly: true });
    // Frontend feature is claimed by @cursor → drops out
    expect(result.map((t) => t.summary)).toEqual([
      "Critical fix",
      "Blocked thing",
      "Loose task",
    ]);
  });

  it("filters unblocked only", () => {
    const result = listTasks(makeTaskFiles(FIXTURE), { unblockedOnly: true });
    // Blocked thing is blocked by critical (which exists) → drops out
    expect(result.map((t) => t.summary)).not.toContain("Blocked thing");
    expect(result).toHaveLength(3);
  });

  it("combines filters (priority + unclaimed + unblocked)", () => {
    const result = listTasks(makeTaskFiles(FIXTURE), {
      priority: "P1",
      unclaimedOnly: true,
      unblockedOnly: true,
    });
    expect(result).toHaveLength(0); // Frontend (claimed) and Blocked (blocked) both filter out
  });

  it("marks blocked status correctly", () => {
    const result = listTasks(makeTaskFiles(FIXTURE));
    const blocked = result.find((t) => t.summary === "Blocked thing");
    expect(blocked).toBeDefined();
    expect(blocked!.blocked).toBe(true);
    const open = result.find((t) => t.summary === "Critical fix");
    expect(open!.blocked).toBe(false);
  });

  it("returns id, tags, claimed, file, line in structured form", () => {
    const result = listTasks(makeTaskFiles(FIXTURE));
    const claimed = result.find((t) => t.summary === "Frontend feature");
    expect(claimed).toMatchObject({
      id: "frontend",
      summary: "Frontend feature",
      priority: "P1",
      tags: ["frontend", "ux"],
      blocked: false,
    });
    // The parser preserves the `@` prefix on claims; we pass it through unchanged.
    expect(claimed!.claimed).toBe("@cursor");
    expect(typeof claimed!.line).toBe("number");
  });
});

describe("CLI", () => {
  it("shows help with --help", () => {
    const result = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/pick/);
    expect(result.stdout).toMatch(/list/);
    expect(result.stdout).toMatch(/stats/);
    expect(result.stdout).toMatch(/diff/);
    expect(result.stdout).toMatch(/watch/);
    expect(result.stdout).toMatch(/sync/);
  });

  // Every visible command's `--help` description must follow the same
  // shape: verb-first, noun-second, no parentheticals, ≤60 chars. This
  // pins the parallel-structure contract from `cli-help-text-parallel-
  // structure` so a future drift (e.g. someone adding "(CLI counterpart
  // of MCP list_tasks)" back to `list`) fails CI immediately.
  it("every visible command description is verb-first, no parens, ≤60 chars", () => {
    const visibleCommands = [
      "init", "generate-commands", "install", "watch", "sync",
      "pick", "list", "stats", "diff",
    ];
    for (const cmd of visibleCommands) {
      const result = spawnSync("node", [CLI, cmd, "--help"], { encoding: "utf-8" });
      expect(result.status, `${cmd} --help should exit 0`).toBe(0);
      // `tasks <cmd> --help` prints `Usage: ...` then a blank line then
      // the description on its own line (Commander leaf-command layout).
      const lines = result.stdout.split("\n");
      const description = (lines[2] ?? "").trim();

      // Verb-first ([A-Z][a-z]+) + space + noun (any non-whitespace token —
      // accommodates `TASKS.md`, `/next-task`, etc.) + at least one more
      // token. The spec's `[\w]+` form was too strict; this matches the
      // intent (verb-first, noun-second, more text after).
      expect(
        description,
        `${cmd}: description "${description}" must start with a capitalized verb followed by another word`
      ).toMatch(/^[A-Z][a-z]+ \S+ /);

      expect(
        description,
        `${cmd}: description "${description}" must not contain parentheses`
      ).not.toMatch(/[()]/);

      expect(
        description.length,
        `${cmd}: description is ${description.length} chars (max 60): "${description}"`
      ).toBeLessThanOrEqual(60);
    }
  });

  // The `tasks lint` subcommand was a duplicate surface for the
  // @tasks-md/lint backend. We collapsed to a single canonical surface
  // (the `tasks-lint` standalone binary in @tasks-md/lint) and removed
  // `tasks lint` entirely. This regression guard fails CI if someone
  // re-adds it: `tasks --help` must NOT advertise a `lint` subcommand,
  // and `tasks lint <file>` must exit non-zero with an "unknown command"
  // diagnostic rather than running silently against the wrong file shape.
  it("removes the `tasks lint` surface — collapse to one canonical lint entry point", () => {
    const help = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(help.status).toBe(0);
    // Top-level command list lines look like `  pick      Pick the …`.
    // We don't want a leading-whitespace `lint` entry in that list.
    expect(help.stdout).not.toMatch(/^\s+lint\b/m);

    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Test\n");
    try {
      const result = spawnSync("node", [CLI, "lint", join(dir, "TASKS.md")], {
        encoding: "utf-8",
        cwd: dir,
      });
      // Commander exits non-zero with an "unknown command" error when the
      // user invokes a command that no longer exists.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/unknown command|error/i);
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

  // Detail-block printing — agents calling `tasks pick` for context get the
  // full Details prose inline, no follow-up file read needed. The two cases
  // pinned here are: with Details (block printed under `Details:` header)
  // and without (no Details header, no empty line). The `--json` shape
  // already exposes metadata as a full object — these tests guard the
  // human-readable parity.

  it("pick prints **Details** block when the task has one", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Add pagination\n  - **Details**: Returns 20 items/page; supports ?page=N\n"
    );
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Picked "Add pagination"/);
      expect(result.stdout).toMatch(/^ {2}Details:$/m);
      expect(result.stdout).toMatch(/^ {4}Returns 20 items\/page; supports \?page=N$/m);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick omits the Details header when the task has no **Details** metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Bare task\n  - **ID**: bare\n"
    );
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Picked "Bare task"/);
      expect(result.stdout).toMatch(/ID: bare/);
      // No `Details:` header at all when the field is absent.
      expect(result.stdout).not.toMatch(/Details:/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick prints multiline **Details** values on indented continuation lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      [
        "# Tasks", "",
        "## P1", "",
        "- [ ] Multi-line task",
        "  - **Details**: First line of context.",
        "    Continuation with more detail.",
        "    Final line.",
        "",
      ].join("\n")
    );
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^ {2}Details:$/m);
      expect(result.stdout).toMatch(/^ {4}First line of context\.$/m);
      expect(result.stdout).toMatch(/^ {4}Continuation with more detail\.$/m);
      expect(result.stdout).toMatch(/^ {4}Final line\.$/m);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // ── --json output across the four read commands (pick / list / stats / diff)
  //
  // These tests pin the cross-command parity contract: every read command
  // accepts `--json`, prints a single-line JSON payload that `JSON.parse`
  // accepts, and advertises `--json` in `--help`. The historical tests for
  // pick/stats/diff (commit a567140) were dropped in commit ccf1360 ("remove
  // unused features") while `tasks list --json` (PR #54) kept the flag — the
  // tests below restore parity so the same drift fails CI next time.

  it("pick --json outputs structured JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] JSON task\n  - **ID**: json-test\n  - **Tags**: backend\n"
    );
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "."], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.picked).toBe(true);
      expect(parsed.summary).toBe("JSON task");
      expect(parsed.priority).toBe("P1");
      expect(parsed.metadata.id).toBe("json-test");
      expect(parsed.metadata.tags).toEqual(["backend"]);
      expect(parsed.line).toBeTypeOf("number");
      expect(parsed.candidates).toBe(1);
      expect(parsed.unblocks).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick --json outputs {picked: false} for empty queue", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n");
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "pick", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.picked).toBe(false);
      // Empty-queue payload must not carry stale fields.
      expect(parsed.summary).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("stats --json outputs structured JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P0\n\n- [ ] Urgent\n\n## P1\n\n- [ ] Normal\n"
    );
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "."], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "stats", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.total).toBe(2);
      expect(parsed.byPriority.P0).toBe(1);
      expect(parsed.byPriority.P1).toBe(1);
      expect(parsed.available).toBe(2);
      expect(parsed.fileCount).toBe(1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("diff --json outputs structured JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Initial\n");
    spawnSync("git", ["init"], { cwd: dir });
    // `-f` forces the add even when the user's global gitignore excludes
    // `TASKS.md` (a common pattern in agent-driven repos). Without `-f` the
    // initial commit would be empty and the diff would report no changes.
    spawnSync("git", ["add", "-f", "TASKS.md"], { cwd: dir });
    spawnSync(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "--no-verify", "-m", "feat: init"],
      { cwd: dir }
    );
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Initial\n\n- [ ] New task\n"
    );
    try {
      const result = spawnSync("node", [CLI, "diff", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.hasChanges).toBe(true);
      expect(parsed.added.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("--help advertises --json for every read command (pick, list, stats, diff)", () => {
    for (const cmd of ["pick", "list", "stats", "diff"]) {
      const result = spawnSync("node", [CLI, cmd, "--help"], { encoding: "utf-8" });
      expect(result.status, `${cmd} --help should exit 0`).toBe(0);
      expect(result.stdout, `${cmd} --help should list --json`).toMatch(/--json/);
    }
  });

  it("list prints priority+id+summary tab-separated by default", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] Critical fix",
        "  - **ID**: critical", "",
        "## P2", "",
        "- [ ] Loose task", "",
      ].join("\n")
    );
    spawnSync("git", ["init"], { cwd: dir });
    spawnSync("git", ["add", "."], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "list"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      // Tab-separated <priority>\t<id>\t<summary>
      const lines = result.stdout.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("P0\tcritical\tCritical fix");
      expect(lines[1]).toBe("P2\t-\tLoose task"); // No ID → "-"
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("list --json outputs valid round-trippable JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] Test\n  - **ID**: test\n  - **Tags**: backend\n"
    );
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "list", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toMatchObject({
        id: "test",
        summary: "Test",
        priority: "P1",
        tags: ["backend"],
        blocked: false,
      });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("list --priority --unclaimed matches MCP list_tasks for the same filter", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(
      join(dir, "TASKS.md"),
      [
        "# Tasks", "",
        "## P0", "",
        "- [ ] P0 unclaimed",
        "  - **ID**: p0a", "",
        "- [ ] P0 claimed (@bob)",
        "  - **ID**: p0b", "",
        "## P1", "",
        "- [ ] P1 unclaimed",
        "  - **ID**: p1a", "",
      ].join("\n")
    );
    spawnSync("git", ["init"], { cwd: dir });
    try {
      // CLI: list --priority P0 --unclaimed
      const cli = spawnSync("node", [CLI, "list", "--priority", "P0", "--unclaimed", "--json"], {
        encoding: "utf-8",
        cwd: dir,
      });
      const cliResult = JSON.parse(cli.stdout);
      expect(cliResult).toHaveLength(1);
      expect(cliResult[0].id).toBe("p0a");

      // MCP parity check via listTasks() (the same function the CLI calls).
      const { loadAllTasks } = await import("./lib.js");
      const { listTasks } = await import("./lib.js");
      const files = loadAllTasks(dir);
      const libResult = listTasks(files, { priority: "P0", unclaimedOnly: true });
      expect(libResult).toHaveLength(1);
      expect(libResult[0].id).toBe("p0a");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("list reports empty match clearly", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Test\n");
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const result = spawnSync("node", [CLI, "list", "--priority", "P0"], {
        encoding: "utf-8",
        cwd: dir,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/No tasks match/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("pick --backend git-native reads the task log instead of TASKS.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-cli-test-"));
    spawnSync("git", ["init"], { cwd: dir });
    try {
      const created = spawnSync(
        "node",
        [
          CLI,
          "create",
          "Git native task",
          "--backend",
          "git-native",
          "--priority",
          "P0",
          "--tag",
          "fleet",
        ],
        { encoding: "utf-8", cwd: dir },
      );
      expect(created.status).toBe(0);
      expect(existsSync(join(dir, "TASKS.md"))).toBe(false);

      const result = spawnSync(
        "node",
        [CLI, "pick", "--backend", "git-native", "--json"],
        { encoding: "utf-8", cwd: dir },
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toMatchObject({
        picked: true,
        id: "git-native-task",
        title: "Git native task",
        priority: "P0",
        tags: ["fleet"],
      });
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
