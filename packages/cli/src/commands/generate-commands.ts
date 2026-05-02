import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

interface AgentConfig {
  name: string;
  outputPath: string;
  agentExample: string;
  transform: (body: string) => string;
}

interface CommandConfig {
  name: string;
  canonicalPath: string;
  agents: AgentConfig[];
}

// Shared description copy. Edit here once — every markdown variant picks it up.
// The Gemini TOML uses GEMINI_DESCRIPTION instead because TOML's double-quoted
// string syntax can't carry the backticks and inline quotes from the long
// markdown form without escaping.
export const AGENT_DESCRIPTION =
  'Pick and work on a task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", wants to start an autonomous coding loop, passes an exact task ID like `/next-task my-task-id`, or runs the standard `standing-audit-gap-loop` audit task.';

export const GEMINI_DESCRIPTION =
  "Pick a queued TASKS.md item, target an exact task ID, or run the standing audit loop";

export const LINT_TASKS_DESCRIPTION =
  'Validate TASKS.md files against the tasks.md spec. Use when the user says "lint tasks", "check tasks", "validate tasks", or before committing changes to TASKS.md. Discovers all TASKS.md files in the repo (including monorepo packages) and runs the linter on each.';

export const LINT_TASKS_GEMINI_DESCRIPTION =
  "Validate TASKS.md files against the tasks.md spec";

function withFrontmatter(frontmatter: string, body: string): string {
  return `${frontmatter}\n\n${body}`;
}

function toGeminiToml(description: string, body: string): string {
  const prompt = body
    .replace(/^## /gm, "")
    .replace(/^### /gm, "")
    .replace(/```bash/g, "")
    .replace(/```markdown/g, "")
    .replace(/```/g, "")
    .replace(/^\s*$/gm, "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");

  return [
    `description = "${description}"`,
    "",
    "prompt = '''",
    prompt,
    "'''",
    "",
  ].join("\n");
}

// ── next-task command ──

const NEXT_TASK_CLAUDE_FRONTMATTER = `---
name: next-task
description: ${AGENT_DESCRIPTION}
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS
---`;

const NEXT_TASK_CODEX_FRONTMATTER = `---
name: next-task
description: ${AGENT_DESCRIPTION}
---`;

const NEXT_TASK_WINDSURF_FRONTMATTER = `---
description: ${AGENT_DESCRIPTION}
---`;

const NEXT_TASK_DEVIN_FRONTMATTER = `---
name: next-task
description: ${AGENT_DESCRIPTION}
allowed-tools:
  - read
  - edit
  - grep
  - glob
  - exec
permissions:
  allow:
    - Exec(git *)
    - Exec(gh *)
    - Exec(find *)
    - Exec(cat *)
    - Exec(node *)
---`;

const NEXT_TASK_CONFIG: CommandConfig = {
  name: "next-task",
  canonicalPath: "commands/next-task.md",
  agents: [
    {
      name: "claude",
      outputPath: "commands/claude/skills/next-task/SKILL.md",
      agentExample: "@claude-code, @claude-code-2",
      transform: (body) => withFrontmatter(NEXT_TASK_CLAUDE_FRONTMATTER, body),
    },
    {
      name: "codex",
      outputPath: "commands/codex/skills/next-task/SKILL.md",
      agentExample: "@codex, @codex-2",
      transform: (body) => withFrontmatter(NEXT_TASK_CODEX_FRONTMATTER, body),
    },
    {
      name: "cursor",
      outputPath: "commands/cursor/next-task.md",
      agentExample: "@cursor, @cursor-2",
      transform: (body) => body,
    },
    {
      name: "devin",
      outputPath: "commands/devin/skills/next-task/SKILL.md",
      agentExample: "@devin, @devin-2",
      transform: (body) => withFrontmatter(NEXT_TASK_DEVIN_FRONTMATTER, body),
    },
    {
      name: "windsurf",
      outputPath: "commands/windsurf/next-task.md",
      agentExample: "@cascade, @cascade-2",
      transform: (body) =>
        withFrontmatter(NEXT_TASK_WINDSURF_FRONTMATTER, body),
    },
    {
      name: "gemini",
      outputPath: "commands/gemini/next-task.toml",
      agentExample: "@gemini, @gemini-2",
      transform: (body) => toGeminiToml(GEMINI_DESCRIPTION, body),
    },
  ],
};

// ── lint-tasks command ──
//
// Lint-tasks doesn't substitute `{{AGENT_EXAMPLE}}` because the canonical
// source has no agent-attribution placeholder — the linter doesn't claim
// tasks. The agentExample field on each AgentConfig is unused for this
// command and kept empty for consistency with the AgentConfig shape.

const LINT_TASKS_CLAUDE_FRONTMATTER = `---
name: lint-tasks
description: ${LINT_TASKS_DESCRIPTION}
---`;

const LINT_TASKS_CODEX_FRONTMATTER = `---
name: lint-tasks
description: ${LINT_TASKS_DESCRIPTION}
---`;

const LINT_TASKS_DEVIN_FRONTMATTER = `---
name: lint-tasks
description: ${LINT_TASKS_DESCRIPTION}
---`;

const LINT_TASKS_WINDSURF_FRONTMATTER = `---
description: ${LINT_TASKS_DESCRIPTION}
---`;

const LINT_TASKS_CONFIG: CommandConfig = {
  name: "lint-tasks",
  canonicalPath: "commands/lint-tasks.md",
  agents: [
    {
      name: "claude",
      outputPath: "commands/claude/skills/lint-tasks/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(LINT_TASKS_CLAUDE_FRONTMATTER, body),
    },
    {
      name: "codex",
      outputPath: "commands/codex/skills/lint-tasks/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(LINT_TASKS_CODEX_FRONTMATTER, body),
    },
    {
      name: "cursor",
      outputPath: "commands/cursor/lint-tasks.md",
      agentExample: "",
      transform: (body) => body,
    },
    {
      name: "devin",
      outputPath: "commands/devin/skills/lint-tasks/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(LINT_TASKS_DEVIN_FRONTMATTER, body),
    },
    {
      name: "windsurf",
      outputPath: "commands/windsurf/lint-tasks.md",
      agentExample: "",
      transform: (body) =>
        withFrontmatter(LINT_TASKS_WINDSURF_FRONTMATTER, body),
    },
    {
      name: "gemini",
      outputPath: "commands/gemini/lint-tasks.toml",
      agentExample: "",
      transform: (body) => toGeminiToml(LINT_TASKS_GEMINI_DESCRIPTION, body),
    },
  ],
};

const COMMANDS: CommandConfig[] = [NEXT_TASK_CONFIG, LINT_TASKS_CONFIG];

export interface GenerateResult {
  generated: string[];
  errors: string[];
  messages: string[];
}

export function generateCommands(repoDir: string): GenerateResult {
  const generated: string[] = [];
  const errors: string[] = [];
  const messages: string[] = [];

  for (const command of COMMANDS) {
    const canonicalPath = join(repoDir, command.canonicalPath);
    if (!existsSync(canonicalPath)) {
      errors.push(`Canonical source not found at ${canonicalPath}`);
      continue;
    }

    const canonical = readFileSync(canonicalPath, "utf-8");
    messages.push(`${command.name}:`);

    for (const agent of command.agents) {
      const body = canonical.replaceAll(
        "{{AGENT_EXAMPLE}}",
        agent.agentExample,
      );
      const output = agent.transform(body);
      const outputPath = join(repoDir, agent.outputPath);

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);

      generated.push(`${command.name}/${agent.name}`);
      messages.push(`  ✓ ${agent.name}`);
    }
  }

  return { generated, errors, messages };
}
