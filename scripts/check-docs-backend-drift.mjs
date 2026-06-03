#!/usr/bin/env node
// Mechanical guard against backend-drift in docs (task: docs-drift-agent-owned-task-model).
//
// The vision is backend-scoped: file-backend mechanics ("append `(@agent)`",
// "edit TASKS.md directly") are NOT the universal rule — in a generated backend
// (git-native / github-issues) `TASKS.md` is a generated snapshot mutated through
// the CLI/MCP. This script fails when a doc presents a file-backend mechanic as a
// universal instruction OUTSIDE a file-backend context, so the docs can't silently
// regress.
//
// A match is ALLOWED when any of these hold:
//   • it is inside a fenced ``` code block (examples/snippets, not prose rules);
//   • the matched line or any of the 3 lines above it carries a file-backend
//     qualifier: "file backend", "file-backend", `tasks-md`, or "best-effort";
//   • the line carries an explicit `drift-allow` marker (for text that quotes the
//     banned phrasing on purpose — e.g. "replace X with Y").
//
// To intentionally allow a new line, add a file-backend qualifier in context or an
// inline `<!-- drift-allow -->` marker. Run: `node scripts/check-docs-backend-drift.mjs`.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BANNED = [
  {
    name: "universal append-claim",
    re: /\bappend(?:ing|s|ed)?\b[^\n]*\(@/i,
    hint: 'present claiming-by-appending `(@agent)` as file-backend-only, or use a CLI op',
  },
  {
    name: "universal edit-TASKS.md-directly",
    re: /\b(?:hand-)?edit(?:ing)?\b[^\n]*\bTASKS\.md\b[^\n]*\bdirectly\b/i,
    hint: 'scope "edit TASKS.md directly" to the file backend (generated backends use the CLI)',
  },
];

const QUALIFIER = /file[- ]backend|`?tasks-md`?|best-effort/i;

function scanFiles() {
  const files = [
    "README.md",
    "ROADMAP.md",
    "ARCHITECTURE.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "spec.md",
    "commands/README.md",
    "commands/next-task.md",
    "commands/lint-tasks.md",
    "commands/setup.md",
  ];
  const userStories = join(ROOT, "docs", "user-stories");
  if (existsSync(userStories)) {
    for (const entry of readdirSync(userStories)) {
      if (entry.endsWith(".md")) files.push(join("docs", "user-stories", entry));
    }
  }
  for (const pkg of ["cli", "mcp", "parser", "lint", "conformance"]) {
    files.push(join("packages", pkg, "README.md"));
  }
  return files.filter((rel) => existsSync(join(ROOT, rel)));
}

function allowedByContext(lines, index) {
  for (let i = Math.max(0, index - 3); i <= index; i += 1) {
    if (QUALIFIER.test(lines[i])) return true;
  }
  return false;
}

/** Scan one file's lines; returns violations [{line, rule, text, hint}]. */
export function scanLines(lines) {
  const found = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /drift-allow/.test(line)) continue;
    for (const rule of BANNED) {
      if (rule.re.test(line) && !allowedByContext(lines, i)) {
        found.push({ line: i + 1, rule: rule.name, text: line.trim(), hint: rule.hint });
      }
    }
  }
  return found;
}

// `--self-test` proves the matcher has teeth without touching the repo files.
if (process.argv.includes("--self-test")) {
  const mustFlag = scanLines(["Claim tasks by appending `(@agent)` before starting."]);
  const mustPassQualifier = scanLines(["File backend: claim by appending `(@you)`."]);
  const mustPassFence = scanLines(["```", "append `(@agent)`", "```"]);
  const mustPassMarker = scanLines(["append `(@agent)` <!-- drift-allow -->"]);
  const ok =
    mustFlag.length === 1 &&
    mustPassQualifier.length === 0 &&
    mustPassFence.length === 0 &&
    mustPassMarker.length === 0;
  if (!ok) {
    console.error("✗ self-test failed: the drift matcher does not behave as specified.");
    console.error({ mustFlag, mustPassQualifier, mustPassFence, mustPassMarker });
    process.exit(1);
  }
  console.log("✓ self-test passed: flags a universal append-claim; allows qualifier/fence/marker.");
  process.exit(0);
}

const violations = [];
for (const rel of scanFiles()) {
  const lines = readFileSync(join(ROOT, rel), "utf-8").split("\n");
  for (const found of scanLines(lines)) {
    violations.push({ rel, ...found });
  }
}

if (violations.length > 0) {
  console.error("✗ docs backend-drift check failed — file-backend mechanics presented as universal:\n");
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.text}`);
    console.error(`    fix: ${v.hint} (or add a file-backend qualifier / <!-- drift-allow -->)\n`);
  }
  process.exit(1);
}

console.log("✓ docs backend-drift check passed (no universal file-backend instructions).");
