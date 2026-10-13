#!/usr/bin/env node
// Docs contract (agentbrew docs/agent-guide-baseline.md): AGENTS.md is a short
// router that Claude Code loads through CLAUDE.md, docs/README.md maps every
// top-level doc, and the README opening links the map.
// Run: `node scripts/check-docs-contract.mjs`. Exit 1 lists every violation.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_GUIDE_BUDGET_BYTES = 10_000;
export const REQUIRED_HEADINGS = [
  "## Start here",
  "## Commands",
  "## Where to change what",
  "## Rules",
  "## Gotchas",
  "## Delivery",
  "## Docs upkeep",
];

/** H2 headings of a Markdown file, outside fenced code. */
export function h2Headings(markdown) {
  let fenced = false;
  const out = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    else if (!fenced && line.startsWith("## ")) out.push(line.trimEnd());
  }
  return out;
}

/** Relative link targets in Markdown, without anchors; URLs and pure anchors dropped. */
export function relativeLinks(markdown) {
  return [...markdown.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/i.test(target));
}

export function checkDocsContract(root) {
  const errors = [];
  const read = (path) => readFileSync(join(root, path), "utf8");

  const guide = read("AGENTS.md");
  const headings = h2Headings(guide);
  if (headings.join("\n") !== REQUIRED_HEADINGS.join("\n")) {
    errors.push(`AGENTS.md H2 sections must be, in order: ${REQUIRED_HEADINGS.join(" / ")}; found: ${headings.join(" / ")}`);
  }
  const bytes = Buffer.byteLength(guide, "utf8");
  if (bytes > AGENT_GUIDE_BUDGET_BYTES) {
    errors.push(`AGENTS.md is ${bytes} bytes; the budget is ${AGENT_GUIDE_BUDGET_BYTES}. Move detail into a linked doc.`);
  }
  for (const target of new Set(relativeLinks(guide))) {
    if (!existsSync(join(root, target))) errors.push(`AGENTS.md links to missing ${target}`);
  }
  const claude = join(root, "CLAUDE.md");
  if (!existsSync(claude) || realpathSync(claude) !== realpathSync(join(root, "AGENTS.md"))) {
    errors.push("CLAUDE.md must be a symlink to AGENTS.md so Claude Code loads the guide");
  }

  const mapPath = join(root, "docs", "README.md");
  if (!existsSync(mapPath)) {
    errors.push("docs/README.md (the docs map) is missing");
  } else {
    const linked = new Set(relativeLinks(read("docs/README.md")).map((target) => resolve(root, "docs", target)));
    for (const name of readdirSync(join(root, "docs"))) {
      if (name.endsWith(".md") && name !== "README.md" && !linked.has(resolve(root, "docs", name))) {
        errors.push(`docs/README.md has no row for docs/${name}`);
      }
    }
    for (const target of linked) {
      if (!existsSync(target)) errors.push(`docs/README.md links to missing ${target}`);
    }
  }

  const opening = read("README.md").split("\n").slice(0, 60).join("\n");
  if (!/```(bash|sh|text)\n/.test(opening)) errors.push("README.md: the first 60 lines need a quickstart code block");
  if (!opening.includes("(docs/README.md)")) errors.push("README.md: the first 60 lines need a link to docs/README.md");

  return errors;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const errors = checkDocsContract(root);
  if (errors.length > 0) {
    console.error(`✗ docs contract check failed — ${errors.length} violation(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log("✓ docs contract check passed (AGENTS.md router, CLAUDE.md, docs map, README opening).");
}
