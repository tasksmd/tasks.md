import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  cpSync, chmodSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

interface AgentMapping {
  name: string;
  detectDir: string;
  sourcePath: string;
  destPath: string;
  isDirectory: boolean;
}

const AGENT_MAPPINGS: AgentMapping[] = [
  {
    name: "claude",
    detectDir: ".claude",
    sourcePath: "commands/claude/skills/next-task",
    destPath: ".claude/skills/next-task",
    isDirectory: true,
  },
  {
    name: "codex",
    detectDir: ".agents",
    sourcePath: "commands/codex/skills/next-task",
    destPath: ".agents/skills/next-task",
    isDirectory: true,
  },
  {
    name: "cursor",
    detectDir: ".cursor",
    sourcePath: "commands/cursor/next-task.md",
    destPath: ".cursor/commands/next-task.md",
    isDirectory: false,
  },
  {
    name: "gemini",
    detectDir: ".gemini",
    sourcePath: "commands/gemini/next-task.toml",
    destPath: ".gemini/commands/next-task.toml",
    isDirectory: false,
  },
  {
    name: "windsurf",
    detectDir: ".windsurf",
    sourcePath: "commands/windsurf/next-task.md",
    destPath: ".windsurf/workflows/next-task.md",
    isDirectory: false,
  },
];

export interface InstallOptions {
  all?: boolean;
  agent?: string;
}

export interface InstallResult {
  installed: string[];
  messages: string[];
}

export function installCommands(
  targetDir: string,
  sourceDir: string,
  options: InstallOptions = {},
): InstallResult {
  const installed: string[] = [];
  const messages: string[] = [];

  for (const mapping of AGENT_MAPPINGS) {
    if (options.agent && options.agent !== mapping.name) continue;

    const detectPath = join(targetDir, mapping.detectDir);
    if (!options.all && !existsSync(detectPath)) continue;

    const src = join(sourceDir, mapping.sourcePath);
    const dst = join(targetDir, mapping.destPath);

    mkdirSync(dirname(dst), { recursive: true });

    if (mapping.isDirectory) {
      cpSync(src, dst, { recursive: true });
    } else {
      const content = readFileSync(src, "utf-8");
      writeFileSync(dst, content);
    }

    installed.push(mapping.name);
    messages.push(`  ✓ ${mapping.name} → ${dst}`);
  }

  return { installed, messages };
}

const HOOK_MARKER = "# tasks-lint pre-commit hook";

const HOOK_BODY = `#!/bin/bash
${HOOK_MARKER}
# Validates staged TASKS.md files before commit.
# Skip with: git commit --no-verify

staged_tasks=$(git diff --cached --name-only --diff-filter=ACM | grep -E "(^|/)TASKS\\.md$" || true)

if [ -n "$staged_tasks" ]; then
  # Try npx tasks-lint first, fall back to local install
  if command -v tasks-lint >/dev/null 2>&1; then
    lint_cmd="tasks-lint"
  else
    lint_cmd="npx --yes tasks-lint@latest"
  fi

  errors=0
  for f in $staged_tasks; do
    if ! $lint_cmd "$f" 2>/dev/null; then
      errors=$((errors + 1))
    fi
  done

  if [ "$errors" -gt 0 ]; then
    echo ""
    echo "Fix TASKS.md issues or skip with: git commit --no-verify"
    exit 1
  fi
fi`;

export interface HookResult {
  installed: boolean;
  message: string;
}

export function installPreCommitHook(targetDir: string): HookResult {
  let gitDir: string;
  try {
    gitDir = execSync("git rev-parse --git-dir", {
      cwd: targetDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return { installed: false, message: "⚠ Not a git repository — skipping hook install" };
  }

  const hooksDir = join(targetDir, gitDir, "hooks");
  const hookFile = join(hooksDir, "pre-commit");
  mkdirSync(hooksDir, { recursive: true });

  if (existsSync(hookFile)) {
    const existing = readFileSync(hookFile, "utf-8");
    if (existing.includes(HOOK_MARKER)) {
      return { installed: false, message: "⊘ Pre-commit hook already has tasks-lint — skipping" };
    }
    const appendBody = HOOK_BODY.split("\n").slice(1).join("\n");
    writeFileSync(hookFile, existing + "\n" + appendBody);
    return { installed: true, message: "✓ Appended tasks-lint to existing pre-commit hook" };
  }

  writeFileSync(hookFile, HOOK_BODY);
  chmodSync(hookFile, 0o755);
  return { installed: true, message: `✓ Installed pre-commit hook: ${hookFile}` };
}
