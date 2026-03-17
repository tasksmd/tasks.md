#!/usr/bin/env node

// Generates docs/index.html from docs/template.html + spec.md + commands/ directory.
// Run: node scripts/build-site.js

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, "spec.md");
const TEMPLATE_PATH = join(ROOT, "docs", "template.html");
const OUTPUT_PATH = join(ROOT, "docs", "index.html");
const COMMANDS_DIR = join(ROOT, "commands");

const spec = readFileSync(SPEC_PATH, "utf-8");
const template = readFileSync(TEMPLATE_PATH, "utf-8");

// ── Extract quick start example from spec ──

function extractQuickStart() {
  // Grab the first fenced code block inside the "## Format" section
  const formatSection = spec.slice(spec.indexOf("## Format"));
  const match = formatSection.match(/```markdown\n([\s\S]*?)```/);
  if (!match) throw new Error("Could not find format example in spec.md");

  // HTML-escape the content for safe embedding inside <code>
  return match[1].trimEnd().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Extract metadata fields table from spec ──

function extractFormatTable() {
  // The spec has a table: | Field | Purpose |
  // Find the metadata table (starts with | Field | Purpose |)
  const tableStart = spec.indexOf("| Field | Purpose |");
  if (tableStart < 0) throw new Error("Could not find metadata table in spec.md");

  const tableEnd = spec.indexOf("\n\n", tableStart);
  const tableText = spec.slice(tableStart, tableEnd);

  const rows = tableText
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("Field"))
    .map((line) => {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 2) return null;

      // Field name has **bold** markers in spec
      const field = cells[0].replace(/\*\*/g, "");
      const purpose = cells[1]
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const examples = {
        ID: "**ID**: auth-fix",
        Tags: "**Tags**: backend, auth",
        Details: "**Details**: JWT returns 500",
        Files: "**Files**: `src/auth.ts`",
        Acceptance: "**Acceptance**: Tests pass",
        "Blocked by": "**Blocked by**: auth-fix",
      };

      const example = examples[field] ?? "";
      return `          <tr>\n            <td>${field}</td>\n            <td>${purpose}</td>\n            <td><code>${example}</code></td>\n          </tr>`;
    })
    .filter(Boolean);

  return rows.join("\n");
}

// ── Generate install table from commands/ directory ──

const AGENT_CONFIG = {
  claude: {
    name: "Claude Code",
    install: "cp -r commands/claude/skills/next-task .claude/skills/",
  },
  codex: {
    name: "Codex",
    install: "cp -r commands/codex/skills/next-task .agents/skills/",
  },
  cursor: {
    name: "Cursor",
    install: "cp commands/cursor/next-task.md .cursor/commands/",
  },
  gemini: {
    name: "Gemini CLI",
    install: "cp commands/gemini/next-task.toml .gemini/commands/",
  },
  windsurf: {
    name: "Windsurf",
    install: "cp commands/windsurf/next-task.md .windsurf/workflows/",
  },
};

function generateInstallTable() {
  const agents = readdirSync(COMMANDS_DIR).filter((entry) => {
    const fullPath = join(COMMANDS_DIR, entry);
    return statSync(fullPath).isDirectory() && entry in AGENT_CONFIG;
  });

  // Sort to match config order
  agents.sort(
    (a, b) =>
      Object.keys(AGENT_CONFIG).indexOf(a) -
      Object.keys(AGENT_CONFIG).indexOf(b)
  );

  return agents
    .map((agent) => {
      const config = AGENT_CONFIG[agent];
      return `          <tr>\n            <td>${config.name}</td>\n            <td><code>${config.install}</code></td>\n          </tr>`;
    })
    .join("\n");
}

// ── Build ──

let output = template;
output = output.replace("{{QUICK_START}}", extractQuickStart());
output = output.replace("{{FORMAT_TABLE}}", extractFormatTable());
output = output.replace("{{INSTALL_TABLE}}", generateInstallTable());

// Add generated notice
output = output.replace(
  "<!DOCTYPE html>",
  "<!-- AUTO-GENERATED from docs/template.html + spec.md — do not edit directly.\n     Run: node scripts/build-site.js -->\n<!DOCTYPE html>"
);

writeFileSync(OUTPUT_PATH, output, "utf-8");

const placeholdersRemaining = output.match(/\{\{[A-Z_]+\}\}/g);
if (placeholdersRemaining) {
  console.error(`WARNING: Unfilled placeholders: ${placeholdersRemaining.join(", ")}`);
  process.exit(1);
}

console.log(`Built docs/index.html from template + spec.md`);
