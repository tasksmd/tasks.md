import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

interface AgentConfig {
  name: string;
  outputPath: string;
  agentExample: string;
  transform: (body: string) => string;
}

function withFrontmatter(frontmatter: string, body: string): string {
  return `${frontmatter}\n\n${body}`;
}

function toGeminiToml(body: string): string {
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
    'description = "Pick and work on the next task from TASKS.md"',
    "",
    "prompt = '''",
    prompt,
    "'''",
    "",
  ].join("\n");
}

const CLAUDE_FRONTMATTER = `---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS
---`;

const CODEX_FRONTMATTER = `---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
---`;

const WINDSURF_FRONTMATTER = `---
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
---`;

const DEVIN_FRONTMATTER = `---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
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

const AGENTS: AgentConfig[] = [
  {
    name: "claude",
    outputPath: "commands/claude/skills/next-task/SKILL.md",
    agentExample: "@claude-code, @claude-code-2",
    transform: (body) => withFrontmatter(CLAUDE_FRONTMATTER, body),
  },
  {
    name: "codex",
    outputPath: "commands/codex/skills/next-task/SKILL.md",
    agentExample: "@codex, @codex-2",
    transform: (body) => withFrontmatter(CODEX_FRONTMATTER, body),
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
    transform: (body) => withFrontmatter(DEVIN_FRONTMATTER, body),
  },
  {
    name: "windsurf",
    outputPath: "commands/windsurf/next-task.md",
    agentExample: "@cascade, @cascade-2",
    transform: (body) => withFrontmatter(WINDSURF_FRONTMATTER, body),
  },
  {
    name: "gemini",
    outputPath: "commands/gemini/next-task.toml",
    agentExample: "@gemini, @gemini-2",
    transform: (body) => toGeminiToml(body),
  },
];

export interface GenerateResult {
  generated: string[];
  errors: string[];
  messages: string[];
}

export function generateCommands(repoDir: string): GenerateResult {
  const canonicalPath = join(repoDir, "commands", "next-task.md");
  const generated: string[] = [];
  const errors: string[] = [];
  const messages: string[] = [];

  if (!existsSync(canonicalPath)) {
    errors.push(`Canonical source not found at ${canonicalPath}`);
    return { generated, errors, messages };
  }

  const canonical = readFileSync(canonicalPath, "utf-8");

  for (const agent of AGENTS) {
    const body = canonical.replaceAll("{{AGENT_EXAMPLE}}", agent.agentExample);
    const output = agent.transform(body);
    const outputPath = join(repoDir, agent.outputPath);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output);

    generated.push(agent.name);
    messages.push(`  ✓ ${agent.name}`);
  }

  return { generated, errors, messages };
}
