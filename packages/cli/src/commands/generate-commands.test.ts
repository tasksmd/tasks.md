import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateCommands,
  AGENT_DESCRIPTION,
  GEMINI_DESCRIPTION,
  LINT_TASKS_DESCRIPTION,
  LINT_TASKS_GEMINI_DESCRIPTION,
} from "./generate-commands.js";

let tempDir: string;

const NEXT_TASK_CANONICAL = `# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 5. Claim and do the work

Append your identity to the task line (e.g., \`{{AGENT_EXAMPLE}}\`):
`;

const LINT_TASKS_CANONICAL = `# Lint Tasks

Validate all \`TASKS.md\` files in the current repo against the spec.

## Find all TASKS.md files

\`\`\`bash
fd TASKS.md "$git_root" --type f --exclude node_modules --exclude .git
\`\`\`

## Lint each file

\`\`\`bash
npx @tasks-md/lint <file>
\`\`\`

## Fix mode

\`\`\`bash
npx @tasks-md/lint --fix <file>
\`\`\`
`;

const SETUP_CANONICAL = `## Set up tasks.md in this repo

Install the workflow for the agent you are: \`tasks install --agent {{AGENT_EXAMPLE}}\`.
`;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "gen-commands-test-"));
  mkdirSync(join(tempDir, "commands"), { recursive: true });
  writeFileSync(join(tempDir, "commands", "next-task.md"), NEXT_TASK_CANONICAL);
  writeFileSync(join(tempDir, "commands", "lint-tasks.md"), LINT_TASKS_CANONICAL);
  writeFileSync(join(tempDir, "commands", "setup.md"), SETUP_CANONICAL);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true });
});

describe("generateCommands", () => {
  describe("next-task variants", () => {
    it("generates all 6 agent command files", () => {
      const result = generateCommands(tempDir);
      expect(result.errors).toHaveLength(0);

      expect(existsSync(join(tempDir, "commands/claude/skills/next-task/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/codex/skills/next-task/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/cursor/next-task.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/devin/skills/next-task/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/windsurf/next-task.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/gemini/next-task.toml"))).toBe(true);
    });

    it("generates the setup command for all 6 agents with per-agent install names", () => {
      const result = generateCommands(tempDir);
      expect(result.errors).toHaveLength(0);
      expect(existsSync(join(tempDir, "commands/claude/skills/setup/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/codex/skills/setup/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/cursor/setup.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/devin/skills/setup/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/windsurf/setup.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/gemini/setup.toml"))).toBe(true);
      // {{AGENT_EXAMPLE}} resolves to the agent's own install name.
      expect(readFileSync(join(tempDir, "commands/devin/skills/setup/SKILL.md"), "utf-8")).toContain(
        "tasks install --agent devin",
      );
      expect(readFileSync(join(tempDir, "commands/cursor/setup.md"), "utf-8")).toContain(
        "tasks install --agent cursor",
      );
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
      expect(content).toContain("prompt = '''");
      expect(content).toMatch(/'''\s*$/);
    });

    it("cursor file has no frontmatter", () => {
      generateCommands(tempDir);
      const content = readFileSync(join(tempDir, "commands/cursor/next-task.md"), "utf-8");
      expect(content).not.toContain("---");
    });

    it("uses the same AGENT_DESCRIPTION across every markdown variant", () => {
      // This test guards against the drift class of bug that motivated
      // generate-commands-frontmatter-source: if anyone edits the description
      // copy and only updates one variant, the unified constant catches the
      // drift in CI before commands-drift fires.
      generateCommands(tempDir);

      const markdownVariants = [
        "commands/claude/skills/next-task/SKILL.md",
        "commands/codex/skills/next-task/SKILL.md",
        "commands/devin/skills/next-task/SKILL.md",
        "commands/windsurf/next-task.md",
      ];

      for (const path of markdownVariants) {
        const content = readFileSync(join(tempDir, path), "utf-8");
        expect(content).toContain(`description: ${AGENT_DESCRIPTION}`);
      }
    });

    it("uses GEMINI_DESCRIPTION for the gemini TOML variant", () => {
      generateCommands(tempDir);
      const content = readFileSync(join(tempDir, "commands/gemini/next-task.toml"), "utf-8");
      expect(content).toContain(`description = "${GEMINI_DESCRIPTION}"`);
    });
  });

  describe("lint-tasks variants", () => {
    it("generates all 6 lint-tasks agent variants", () => {
      const result = generateCommands(tempDir);
      expect(result.errors).toHaveLength(0);

      expect(existsSync(join(tempDir, "commands/claude/skills/lint-tasks/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/codex/skills/lint-tasks/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/cursor/lint-tasks.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/devin/skills/lint-tasks/SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/windsurf/lint-tasks.md"))).toBe(true);
      expect(existsSync(join(tempDir, "commands/gemini/lint-tasks.toml"))).toBe(true);
    });

    it("propagates the canonical body content to every variant", () => {
      generateCommands(tempDir);

      const variants = [
        "commands/claude/skills/lint-tasks/SKILL.md",
        "commands/codex/skills/lint-tasks/SKILL.md",
        "commands/cursor/lint-tasks.md",
        "commands/devin/skills/lint-tasks/SKILL.md",
        "commands/windsurf/lint-tasks.md",
      ];

      for (const path of variants) {
        const content = readFileSync(join(tempDir, path), "utf-8");
        expect(content).toContain("# Lint Tasks");
        expect(content).toContain("Find all TASKS.md files");
        expect(content).toContain("Fix mode");
        expect(content).toContain("npx @tasks-md/lint --fix");
      }
    });

    it("uses LINT_TASKS_DESCRIPTION across every markdown variant", () => {
      generateCommands(tempDir);

      const markdownVariants = [
        "commands/claude/skills/lint-tasks/SKILL.md",
        "commands/codex/skills/lint-tasks/SKILL.md",
        "commands/devin/skills/lint-tasks/SKILL.md",
        "commands/windsurf/lint-tasks.md",
      ];

      for (const path of markdownVariants) {
        const content = readFileSync(join(tempDir, path), "utf-8");
        expect(content).toContain(`description: ${LINT_TASKS_DESCRIPTION}`);
      }
    });

    it("uses LINT_TASKS_GEMINI_DESCRIPTION for the gemini TOML variant", () => {
      generateCommands(tempDir);
      const content = readFileSync(join(tempDir, "commands/gemini/lint-tasks.toml"), "utf-8");
      expect(content).toContain(`description = "${LINT_TASKS_GEMINI_DESCRIPTION}"`);
    });

    it("does not substitute AGENT_EXAMPLE in lint-tasks variants", () => {
      // Lint-tasks canonical has no agent-attribution placeholder; the
      // substitute-empty-string default keeps any literal `{{AGENT_EXAMPLE}}`
      // out of the output, but more importantly there's nothing to substitute.
      generateCommands(tempDir);

      const claude = readFileSync(join(tempDir, "commands/claude/skills/lint-tasks/SKILL.md"), "utf-8");
      expect(claude).not.toContain("{{AGENT_EXAMPLE}}");
    });

    it("cursor lint-tasks file has no frontmatter", () => {
      generateCommands(tempDir);
      const content = readFileSync(join(tempDir, "commands/cursor/lint-tasks.md"), "utf-8");
      expect(content).not.toContain("---");
      expect(content).toMatch(/^# Lint Tasks/);
    });

    it("generates valid TOML for Gemini lint-tasks", () => {
      generateCommands(tempDir);
      const content = readFileSync(join(tempDir, "commands/gemini/lint-tasks.toml"), "utf-8");
      expect(content).toMatch(/^description = "/);
      expect(content).toContain("prompt = '''");
      expect(content).toMatch(/'''\s*$/);
    });
  });

  describe("error handling", () => {
    it("returns error when next-task canonical source is missing", () => {
      rmSync(join(tempDir, "commands", "next-task.md"));
      const result = generateCommands(tempDir);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it("returns error when lint-tasks canonical source is missing", () => {
      rmSync(join(tempDir, "commands", "lint-tasks.md"));
      const result = generateCommands(tempDir);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("lint-tasks.md"))).toBe(true);
    });

    it("still generates the other command when one canonical is missing", () => {
      rmSync(join(tempDir, "commands", "lint-tasks.md"));
      const result = generateCommands(tempDir);
      // next-task should still be generated
      expect(existsSync(join(tempDir, "commands/claude/skills/next-task/SKILL.md"))).toBe(true);
      // lint-tasks should be skipped
      expect(existsSync(join(tempDir, "commands/claude/skills/lint-tasks/SKILL.md"))).toBe(false);
    });
  });

  it("reports generated entries for all commands", () => {
    const result = generateCommands(tempDir);
    expect(result.generated.length).toBe(18); // 6 agents × 3 commands
    expect(result.generated).toContain("next-task/claude");
    expect(result.generated).toContain("lint-tasks/claude");
    expect(result.generated).toContain("setup/claude");
  });
});
