#!/usr/bin/env node
// Docs contract (agentbrew docs/agent-guide-baseline.md): AGENTS.md is a short
// router that Claude Code loads through CLAUDE.md, docs/README.md maps every
// top-level doc, and the README opening links the map.
// Each user story in docs/user-stories/NN-*.md names its metric and its tests,
// and the tests it names exist (see checkUserStories).
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
  // The first quickstart block is the one-command setup; it must end in the health check.
  const firstBlock = /```[a-z]*\n([\s\S]*?)```/.exec(opening)?.[1] ?? "";
  if (firstBlock && !firstBlock.includes("@tasks-md/cli doctor")) {
    errors.push("README.md: the first quickstart block must verify with `npx -y @tasks-md/cli doctor`");
  }

  return errors;
}

const TEST_REF = /`([^`\s]+\.(?:mjs|js|ts))`(?:\s*\(([^)]*)\))?/g;

/**
 * User-story drift: every docs/user-stories/NN-*.md has a `- **Metric**:` line
 * and a `- **Tests**:` line. Each backticked test path exists; each quoted case
 * name after a path appears in that file; each tests/e2e file names its story
 * (`USNN`); and every tests/e2e/usNN-* file is listed by story NN.
 */
export function checkUserStories(root) {
  const errors = [];
  const storyDir = join(root, "docs", "user-stories");
  if (!existsSync(storyDir)) return errors;
  const listed = new Set();
  for (const name of readdirSync(storyDir).sort()) {
    const match = /^(\d\d)-.+\.md$/.exec(name);
    if (!match) continue;
    const id = `US${match[1]}`;
    const text = readFileSync(join(storyDir, name), "utf8");
    const metric = /^- \*\*Metric\*\*: *(\S.*)$/m.exec(text);
    if (!metric) errors.push(`docs/user-stories/${name}: no \`- **Metric**:\` line`);
    const tests = /^- \*\*Tests\*\*: *(\S.*)$/m.exec(text);
    if (!tests) {
      errors.push(`docs/user-stories/${name}: no \`- **Tests**:\` line`);
      continue;
    }
    const refs = [...tests[1].matchAll(TEST_REF)];
    if (refs.length === 0) errors.push(`docs/user-stories/${name}: the Tests line names no test file`);
    for (const [, path, cases = ""] of refs) {
      const file = join(root, path);
      if (!existsSync(file)) {
        errors.push(`docs/user-stories/${name}: \`${path}\` does not exist`);
        continue;
      }
      const body = readFileSync(file, "utf8");
      for (const [, caseName] of cases.matchAll(/"([^"]+)"/g)) {
        if (!body.includes(caseName)) errors.push(`docs/user-stories/${name}: \`${path}\` has no case "${caseName}"`);
      }
      if (path.startsWith("tests/e2e/")) {
        listed.add(path);
        if (!body.includes(id)) errors.push(`${path} does not name ${id}; tag its cases with the story ID`);
      }
    }
  }
  const e2eDir = join(root, "tests", "e2e");
  if (existsSync(e2eDir)) {
    for (const name of readdirSync(e2eDir).sort()) {
      if (/^us\d\d-.+\.test\.mjs$/.test(name) && !listed.has(`tests/e2e/${name}`)) {
        errors.push(`tests/e2e/${name} is not listed by its story's Tests line`);
      }
    }
  }
  return errors;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const errors = [...checkDocsContract(root), ...checkUserStories(root)];
  if (errors.length > 0) {
    console.error(`✗ docs contract check failed — ${errors.length} violation(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log("✓ docs contract check passed (AGENTS.md router, CLAUDE.md, docs map, README opening, user stories).");
}
