import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateCommands } from "./generate-commands.js";

let tempDir: string;

const CANONICAL_CONTENT = `# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 5. Claim and do the work

Append your identity to the task line (e.g., \`{{AGENT_EXAMPLE}}\`):
`;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "gen-commands-test-"));
  mkdirSync(join(tempDir, "commands"), { recursive: true });
  writeFileSync(join(tempDir, "commands", "next-task.md"), CANONICAL_CONTENT);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("generateCommands", () => {
  it("generates all 5 agent command files", () => {
    const result = generateCommands(tempDir);
    expect(result.generated).toHaveLength(5);
    expect(result.errors).toHaveLength(0);

    expect(existsSync(join(tempDir, "commands/claude/skills/next-task/SKILL.md"))).toBe(true);
    expect(existsSync(join(tempDir, "commands/codex/skills/next-task/SKILL.md"))).toBe(true);
    expect(existsSync(join(tempDir, "commands/cursor/next-task.md"))).toBe(true);
    expect(existsSync(join(tempDir, "commands/windsurf/next-task.md"))).toBe(true);
    expect(existsSync(join(tempDir, "commands/gemini/next-task.toml"))).toBe(true);
  });

  it("substitutes agent examples in each file", () => {
    generateCommands(tempDir);

    const claude = readFileSync(join(tempDir, "commands/claude/skills/next-task/SKILL.md"), "utf-8");
    expect(claude).toContain("@claude-code, @claude-code-2");
    expect(claude).not.toContain("{{AGENT_EXAMPLE}}");

    const codex = readFileSync(join(tempDir, "commands/codex/skills/next-task/SKILL.md"), "utf-8");
    expect(codex).toContain("@codex, @codex-2");

    const cursor = readFileSync(join(tempDir, "commands/cursor/next-task.md"), "utf-8");
    expect(cursor).toContain("@cursor, @cursor-2");

    const windsurf = readFileSync(join(tempDir, "commands/windsurf/next-task.md"), "utf-8");
    expect(windsurf).toContain("@cascade, @cascade-2");

    const gemini = readFileSync(join(tempDir, "commands/gemini/next-task.toml"), "utf-8");
    expect(gemini).toContain("@gemini, @gemini-2");
  });

  it("adds correct frontmatter for Claude", () => {
    generateCommands(tempDir);
    const content = readFileSync(join(tempDir, "commands/claude/skills/next-task/SKILL.md"), "utf-8");
    expect(content).toMatch(/^---\nname: next-task\n/);
    expect(content).toContain("disable-model-invocation: true");
    expect(content).toContain("allowed-tools:");
  });

  it("adds correct frontmatter for Codex", () => {
    generateCommands(tempDir);
    const content = readFileSync(join(tempDir, "commands/codex/skills/next-task/SKILL.md"), "utf-8");
    expect(content).toMatch(/^---\nname: next-task\n/);
    expect(content).not.toContain("disable-model-invocation");
  });

  it("adds correct frontmatter for Windsurf", () => {
    generateCommands(tempDir);
    const content = readFileSync(join(tempDir, "commands/windsurf/next-task.md"), "utf-8");
    expect(content).toMatch(/^---\ndescription:/);
  });

  it("generates valid TOML for Gemini", () => {
    generateCommands(tempDir);
    const content = readFileSync(join(tempDir, "commands/gemini/next-task.toml"), "utf-8");
    expect(content).toMatch(/^description = "/);
    expect(content).toContain('prompt = """');
    expect(content).toMatch(/"""\s*$/);
  });

  it("cursor file has no frontmatter", () => {
    generateCommands(tempDir);
    const content = readFileSync(join(tempDir, "commands/cursor/next-task.md"), "utf-8");
    expect(content).not.toContain("---");
  });

  it("returns error when canonical source is missing", () => {
    rmSync(join(tempDir, "commands", "next-task.md"));
    const result = generateCommands(tempDir);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not found");
  });
});
