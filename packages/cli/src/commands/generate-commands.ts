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
  'Pick and work on a task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", wants to start an autonomous coding loop, passes an exact task ID like `/next-task my-task-id`, runs the standard `standing-audit-gap-loop` audit task, or wants task draining to honor active `/ship-it` mode.';

export const GEMINI_DESCRIPTION =
  "Pick a queued TASKS.md item, target an exact task ID, honor ship-it mode, or run the standing audit loop";

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
    - Bash(git *)
    - Bash(gh *)
    - Bash(find *)
    - Bash(cat *)
    - Bash(node *)
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

// ── setup command ──

export const SETUP_DESCRIPTION =
  'Set up tasks.md in this repo. Use when the user says "set up tasks.md", "use tasks.md in this repo", "install the task queue", or pastes the one-prompt setup block from the README.';

export const SETUP_GEMINI_DESCRIPTION = "Set up the TASKS.md task queue and /next-task workflow in this repo";

const SETUP_CLAUDE_FRONTMATTER = `---
name: setup
description: ${SETUP_DESCRIPTION}
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, LS
---`;

const SETUP_CODEX_FRONTMATTER = `---
name: setup
description: ${SETUP_DESCRIPTION}
---`;

const SETUP_DEVIN_FRONTMATTER = `---
name: setup
description: ${SETUP_DESCRIPTION}
allowed-tools:
  - read
  - write
  - edit
  - grep
  - glob
  - exec
permissions:
  allow:
    - Bash(git *)
    - Bash(npx *)
    - Bash(node *)
---`;

const SETUP_WINDSURF_FRONTMATTER = `---
description: ${SETUP_DESCRIPTION}
---`;

const SETUP_CONFIG: CommandConfig = {
  name: "setup",
  canonicalPath: "commands/setup.md",
  agents: [
    {
      name: "claude",
      outputPath: "commands/claude/skills/setup/SKILL.md",
      agentExample: "claude",
      transform: (body) => withFrontmatter(SETUP_CLAUDE_FRONTMATTER, body),
    },
    {
      name: "codex",
      outputPath: "commands/codex/skills/setup/SKILL.md",
      agentExample: "codex",
      transform: (body) => withFrontmatter(SETUP_CODEX_FRONTMATTER, body),
    },
    {
      name: "cursor",
      outputPath: "commands/cursor/setup.md",
      agentExample: "cursor",
      transform: (body) => body,
    },
    {
      name: "devin",
      outputPath: "commands/devin/skills/setup/SKILL.md",
      agentExample: "devin",
      transform: (body) => withFrontmatter(SETUP_DEVIN_FRONTMATTER, body),
    },
    {
      name: "windsurf",
      outputPath: "commands/windsurf/setup.md",
      agentExample: "windsurf",
      transform: (body) => withFrontmatter(SETUP_WINDSURF_FRONTMATTER, body),
    },
    {
      name: "gemini",
      outputPath: "commands/gemini/setup.toml",
      agentExample: "gemini",
      transform: (body) => toGeminiToml(SETUP_GEMINI_DESCRIPTION, body),
    },
  ],
};

// ── migrate command ──

export const MIGRATE_DESCRIPTION =
  'Migrate this repo\'s TASKS.md queue to the collision-free git-native backend. Use when the user says "migrate to git-native", "convert this repo to git-native", "switch backends", or wants collision-free claims for a multi-contributor repo.';

export const MIGRATE_GEMINI_DESCRIPTION =
  "Convert this repo's queue to the collision-free git-native backend";

const MIGRATE_CLAUDE_FRONTMATTER = `---
name: migrate
description: ${MIGRATE_DESCRIPTION}
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, LS
---`;

const MIGRATE_CODEX_FRONTMATTER = `---
name: migrate
description: ${MIGRATE_DESCRIPTION}
---`;

const MIGRATE_DEVIN_FRONTMATTER = `---
name: migrate
description: ${MIGRATE_DESCRIPTION}
allowed-tools:
  - read
  - write
  - edit
  - grep
  - glob
  - exec
permissions:
  allow:
    - Bash(git *)
    - Bash(npx *)
    - Bash(node *)
    - Bash(lefthook *)
---`;

const MIGRATE_WINDSURF_FRONTMATTER = `---
description: ${MIGRATE_DESCRIPTION}
---`;

const MIGRATE_CONFIG: CommandConfig = {
  name: "migrate",
  canonicalPath: "commands/migrate.md",
  agents: [
    {
      name: "claude",
      outputPath: "commands/claude/skills/migrate/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(MIGRATE_CLAUDE_FRONTMATTER, body),
    },
    {
      name: "codex",
      outputPath: "commands/codex/skills/migrate/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(MIGRATE_CODEX_FRONTMATTER, body),
    },
    {
      name: "cursor",
      outputPath: "commands/cursor/migrate.md",
      agentExample: "",
      transform: (body) => body,
    },
    {
      name: "devin",
      outputPath: "commands/devin/skills/migrate/SKILL.md",
      agentExample: "",
      transform: (body) => withFrontmatter(MIGRATE_DEVIN_FRONTMATTER, body),
    },
    {
      name: "windsurf",
      outputPath: "commands/windsurf/migrate.md",
      agentExample: "",
      transform: (body) => withFrontmatter(MIGRATE_WINDSURF_FRONTMATTER, body),
    },
    {
      name: "gemini",
      outputPath: "commands/gemini/migrate.toml",
      agentExample: "",
      transform: (body) => toGeminiToml(MIGRATE_GEMINI_DESCRIPTION, body),
    },
  ],
};

const COMMANDS: CommandConfig[] = [
  NEXT_TASK_CONFIG,
  LINT_TASKS_CONFIG,
  SETUP_CONFIG,
  MIGRATE_CONFIG,
];

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
