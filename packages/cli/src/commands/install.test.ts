import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync, mkdirSync, rmSync, existsSync,
  readFileSync, writeFileSync, realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { installCommands, installPreCommitHook } from "./install.js";

let tempDir: string;
let commandsDir: string;

function setupCommandSources(dir: string): void {
  const cmds = join(dir, "commands");
  mkdirSync(join(cmds, "claude", "skills", "next-task"), { recursive: true });
  writeFileSync(join(cmds, "claude", "skills", "next-task", "SKILL.md"), "# Claude skill\n");
  mkdirSync(join(cmds, "codex", "skills", "next-task"), { recursive: true });
  writeFileSync(join(cmds, "codex", "skills", "next-task", "SKILL.md"), "# Codex skill\n");
  mkdirSync(join(cmds, "cursor"), { recursive: true });
  writeFileSync(join(cmds, "cursor", "next-task.md"), "# Cursor\n");
  mkdirSync(join(cmds, "gemini"), { recursive: true });
  writeFileSync(join(cmds, "gemini", "next-task.toml"), 'description = "test"\n');
  mkdirSync(join(cmds, "windsurf"), { recursive: true });
  writeFileSync(join(cmds, "windsurf", "next-task.md"), "# Windsurf\n");
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "tasks-install-test-"));
  commandsDir = join(tempDir, "source");
  mkdirSync(commandsDir);
  setupCommandSources(commandsDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("installCommands", () => {
  it("installs to detected agent directories", () => {
    const targetDir = join(tempDir, "project");
    mkdirSync(join(targetDir, ".claude"), { recursive: true });
    mkdirSync(join(targetDir, ".cursor"), { recursive: true });

    const result = installCommands(targetDir, commandsDir, { all: false });
    expect(result.installed).toContain("claude");
    expect(result.installed).toContain("cursor");
    expect(result.installed).not.toContain("codex");

    expect(existsSync(join(targetDir, ".claude", "skills", "next-task", "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".cursor", "commands", "next-task.md"))).toBe(true);
  });

  it("installs all agents with --all flag", () => {
    const targetDir = join(tempDir, "project");
    mkdirSync(targetDir);

    const result = installCommands(targetDir, commandsDir, { all: true });
    expect(result.installed).toHaveLength(5);
    expect(result.installed).toContain("claude");
    expect(result.installed).toContain("codex");
    expect(result.installed).toContain("cursor");
    expect(result.installed).toContain("gemini");
    expect(result.installed).toContain("windsurf");
  });

  it("filters to a specific agent", () => {
    const targetDir = join(tempDir, "project");
    mkdirSync(join(targetDir, ".claude"), { recursive: true });
    mkdirSync(join(targetDir, ".cursor"), { recursive: true });

    const result = installCommands(targetDir, commandsDir, { agent: "cursor" });
    expect(result.installed).toEqual(["cursor"]);
  });

  it("returns empty when no agents detected and not --all", () => {
    const targetDir = join(tempDir, "project");
    mkdirSync(targetDir);

    const result = installCommands(targetDir, commandsDir, { all: false });
    expect(result.installed).toHaveLength(0);
  });

  it("copies directory contents for claude/codex (skill dirs)", () => {
    const targetDir = join(tempDir, "project");
    mkdirSync(targetDir);

    installCommands(targetDir, commandsDir, { all: true });
    const content = readFileSync(
      join(targetDir, ".claude", "skills", "next-task", "SKILL.md"),
      "utf-8"
    );
    expect(content).toBe("# Claude skill\n");
  });
});

describe("installPreCommitHook", () => {
  it("creates a new pre-commit hook", () => {
    const targetDir = realpathSync(mkdtempSync(join(tmpdir(), "hook-test-")));
    execSync("git init", { cwd: targetDir, stdio: "pipe" });

    const result = installPreCommitHook(targetDir);
    expect(result.installed).toBe(true);

    const hookPath = join(targetDir, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("tasks-lint");
    expect(content).toContain("# tasks-lint pre-commit hook");

    rmSync(targetDir, { recursive: true });
  });

  it("skips when hook already has tasks-lint marker", () => {
    const targetDir = realpathSync(mkdtempSync(join(tmpdir(), "hook-test-")));
    execSync("git init", { cwd: targetDir, stdio: "pipe" });

    const hookPath = join(targetDir, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/bash\n# tasks-lint pre-commit hook\necho existing\n");

    const result = installPreCommitHook(targetDir);
    expect(result.installed).toBe(false);
    expect(result.message).toContain("already");

    rmSync(targetDir, { recursive: true });
  });

  it("appends to existing hook without marker", () => {
    const targetDir = realpathSync(mkdtempSync(join(tmpdir(), "hook-test-")));
    execSync("git init", { cwd: targetDir, stdio: "pipe" });

    const hookPath = join(targetDir, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/bash\necho other-hook\n");

    const result = installPreCommitHook(targetDir);
    expect(result.installed).toBe(true);

    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("echo other-hook");
    expect(content).toContain("tasks-lint");

    rmSync(targetDir, { recursive: true });
  });

  it("returns error when not a git repo", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "no-git-"));

    const result = installPreCommitHook(targetDir);
    expect(result.installed).toBe(false);
    expect(result.message).toContain("Not a git");

    rmSync(targetDir, { recursive: true });
  });
});
