#!/usr/bin/env node
// Guard against volatile inventory counts in canonical docs.
//
// Counts such as "six agents", "four packages", or "10+ repos" go stale the
// moment an agent, package, or repo is added or removed. Canonical docs name
// the items or link the source of truth instead (for example the generator
// output under `commands/`, or the `packages/` directory).
//
// A match is ALLOWED when any of these hold:
//   • it is inside a fenced ``` code block (examples, real command output);
//   • it is a sizing threshold: the number follows ≥, ≤, <, >, "at least",
//     "up to", "under", "over", "more than", "fewer than", "max", or "min";
//   • the line carries a `volatile-count-allowlist: <reason>` marker.
//
// "one" and "two" are not flagged: "one agent" and "two agents can race" are
// generic phrasing, not an inventory.
//
// Run: `node scripts/check-volatile-counts.mjs` (or `--self-test`).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const NUMBER_WORDS =
  "three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|dozens?";
const NOUNS = "repos|repositories|agents|packages|variants";
// A count, up to two qualifier words ("npm", "per-agent", "work"), then an inventory noun.
const COUNT_RE = new RegExp(
  `\\b(?:\\d[\\d,]*\\+?|${NUMBER_WORDS})\\s+(?:[\\w-]+\\s+){0,2}?(?:${NOUNS})\\b`,
  "gi",
);
const THRESHOLD_RE =
  /(?:[≥≤<>]=?|\bat least|\bup to|\bunder|\bover|\bmore than|\bfewer than|\bless than|\bmax(?:imum)?|\bmin(?:imum)?)\s*$/i;
const ALLOWLIST_MARKER = "volatile-count-allowlist:";

export function scanFiles() {
  const files = ["README.md", "CONTRIBUTING.md", "AGENTS.md", "ARCHITECTURE.md", "ROADMAP.md", "VISION.md"];
  const commandsDir = join(ROOT, "commands");
  if (existsSync(commandsDir)) {
    for (const entry of readdirSync(commandsDir)) {
      if (entry.endsWith(".md")) files.push(join("commands", entry));
    }
  }
  const userStories = join(ROOT, "docs", "user-stories");
  if (existsSync(userStories)) {
    for (const entry of readdirSync(userStories)) {
      if (entry.endsWith(".md")) files.push(join("docs", "user-stories", entry));
    }
  }
  return files.filter((rel) => existsSync(join(ROOT, rel)));
}

/** Scan one file's lines; returns violations [{line, match, text}]. */
export function scanLines(lines) {
  const found = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.includes(ALLOWLIST_MARKER)) continue;
    for (const m of line.matchAll(COUNT_RE)) {
      if (THRESHOLD_RE.test(line.slice(0, m.index))) continue;
      found.push({ line: i + 1, match: m[0], text: line.trim() });
    }
  }
  return found;
}

// `--self-test` proves the matcher has teeth without touching the repo files.
if (process.argv.includes("--self-test")) {
  const mustFlag = scanLines(["One spec, six agents, any CI."]);
  const mustPassGeneric = scanLines(["Two agents can race to claim a task."]);
  const mustPassThreshold = scanLines(["Supports up to 100 repos per workspace."]);
  const mustPassFence = scanLines(["```", "Installed for 6 agents", "```"]);
  const mustPassMarker = scanLines([`Shipped 4 packages. <!-- ${ALLOWLIST_MARKER} history -->`]);
  const ok =
    mustFlag.length === 1 &&
    mustPassGeneric.length === 0 &&
    mustPassThreshold.length === 0 &&
    mustPassFence.length === 0 &&
    mustPassMarker.length === 0;
  if (!ok) {
    console.error("✗ self-test failed: the volatile-count matcher does not behave as specified.");
    console.error({ mustFlag, mustPassGeneric, mustPassThreshold, mustPassFence, mustPassMarker });
    process.exit(1);
  }
  console.log("✓ self-test passed: flags an inventory count; allows generic/threshold/fence/marker.");
  process.exit(0);
}

// Only run the scan when executed directly, so the test can import scanLines.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = [];
  for (const rel of scanFiles()) {
    const lines = readFileSync(join(ROOT, rel), "utf-8").split("\n");
    for (const found of scanLines(lines)) {
      violations.push({ rel, ...found });
    }
  }

  if (violations.length > 0) {
    console.error(`✗ volatile-count check failed — ${violations.length} inventory count(s) in canonical docs:\n`);
    for (const v of violations) {
      console.error(`  ${v.rel}:${v.line}  "${v.match}"`);
      console.error(`    ${v.text}`);
    }
    console.error(
      `\n  fix: delete the count, link the source of truth, or name the items.` +
        ` For a deliberate count, add <!-- ${ALLOWLIST_MARKER} <reason> --> to the line.`,
    );
    process.exit(1);
  }

  console.log("✓ volatile-count check passed (0 violations).");
}
