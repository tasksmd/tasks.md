import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock execFileSync before importing the module that uses it
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExec = vi.mocked(execFileSync);

// Import after mocking
import { buildListArgs, buildPickArgs, resolveBackend, runTasksCli } from "./backend.js";

describe("backend helpers", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "mcp-backend-test-"));
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("resolveBackend", () => {
    it("defaults to tasks-md when no .tasksmd.json exists", () => {
      const config = resolveBackend(testDir);
      expect(config.backend).toBe("tasks-md");
      expect(config.label).toBe("tasks.md");
    });

    it("reads backend from .tasksmd.json", async () => {
      await writeFile(
        join(testDir, ".tasksmd.json"),
        JSON.stringify({ backend: "github-issues", repo: "owner/repo", label: "tasks" })
      );
      const config = resolveBackend(testDir);
      expect(config.backend).toBe("github-issues");
      expect(config.repo).toBe("owner/repo");
      expect(config.label).toBe("tasks");
    });

    it("uses default label when not specified in .tasksmd.json", async () => {
      await writeFile(
        join(testDir, ".tasksmd.json"),
        JSON.stringify({ backend: "github-issues" })
      );
      const config = resolveBackend(testDir);
      expect(config.label).toBe("tasks.md");
    });

    it("throws on invalid JSON in .tasksmd.json", async () => {
      await writeFile(join(testDir, ".tasksmd.json"), "not valid json");
      expect(() => resolveBackend(testDir)).toThrow(".tasksmd.json is not valid JSON");
    });

    it("throws on unknown backend", async () => {
      await writeFile(
        join(testDir, ".tasksmd.json"),
        JSON.stringify({ backend: "unknown-backend" })
      );
      expect(() => resolveBackend(testDir)).toThrow(
        'Unknown task backend "unknown-backend"'
      );
    });
  });

  describe("runTasksCli", () => {
    it("throws a clear error when CLI fails", () => {
      mockExec.mockImplementation(() => {
        throw new Error("command not found");
      });

      expect(() => runTasksCli(["list"], testDir)).toThrow("tasks CLI failed: command not found");
    });

    it("trims output", () => {
      mockExec.mockReturnValue("  output with spaces  \n" as never);
      const result = runTasksCli(["list"], testDir);
      expect(result).toBe("output with spaces");
    });

    it("passes arguments to execFileSync", () => {
      mockExec.mockReturnValue("result" as never);
      runTasksCli(["list", "--json"], testDir);
      // Verify execFileSync was called (either with local binary or npx)
      expect(mockExec).toHaveBeenCalled();
    });
  });
});

describe("github-issues delegation argv", () => {
  // Pins the delegated flag surface against the CLI's real `list`/`pick`
  // options. Regression guard: an earlier draft emitted `--repo`/`--id`,
  // which the CLI's `list`/`pick` commands reject as unknown options (the
  // repo is resolved by the CLI from `.tasksmd.json` at the same cwd).
  describe("buildListArgs", () => {
    it("emits only `list --json` with no filters", () => {
      expect(buildListArgs({})).toEqual(["list", "--json"]);
    });

    it("emits every supported filter flag", () => {
      expect(
        buildListArgs({
          priority: "P1",
          tag: "infra",
          unclaimed_only: true,
          unblocked_only: true,
        })
      ).toEqual([
        "list",
        "--json",
        "--priority",
        "P1",
        "--tag",
        "infra",
        "--unclaimed",
        "--unblocked",
      ]);
    });

    it("never emits --repo or --id (unsupported on `list`)", () => {
      const args = buildListArgs({
        priority: "P0",
        tag: "x",
        unclaimed_only: true,
        unblocked_only: true,
      });
      expect(args).not.toContain("--repo");
      expect(args).not.toContain("--id");
    });
  });

  describe("buildPickArgs", () => {
    it("emits `pick --json` with no tags", () => {
      expect(buildPickArgs({})).toEqual(["pick", "--json"]);
    });

    it("emits --tags when provided", () => {
      expect(buildPickArgs({ tags: "a,b" })).toEqual([
        "pick",
        "--json",
        "--tags",
        "a,b",
      ]);
    });

    it("never emits --repo or --id (unsupported on `pick`)", () => {
      const args = buildPickArgs({ tags: "a,b" });
      expect(args).not.toContain("--repo");
      expect(args).not.toContain("--id");
    });
  });
});
