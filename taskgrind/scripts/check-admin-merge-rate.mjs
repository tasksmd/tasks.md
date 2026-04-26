#!/usr/bin/env node
// scripts/check-admin-merge-rate.mjs
//
// Rate-limit check for autonomous `gh pr merge --admin` self-merges.
// Implements taskgrind.md rule 7: an autonomous agent may admin-merge
// at most N (default 5) of its own PRs in any rolling 24-hour window.
//
// The 2026-04-24 grind shipped ~15 self-authored admin merges in 12
// hours with zero reviewers — the volume on a shared master branch is
// the real risk surface, not any individual merge. This script makes
// the rate observable and enforceable.
//
// Usage:
//   node scripts/check-admin-merge-rate.mjs           # query gh, check rate
//   node scripts/check-admin-merge-rate.mjs --json    # also dump JSON
//   node scripts/check-admin-merge-rate.mjs --from-file <path>
//                                                     # test mode: load
//                                                     # JSON instead of gh
//
// Configuration (env vars):
//   ADMIN_MERGE_LIMIT  — max self-merges per window (default: 5)
//   ADMIN_MERGE_WINDOW — window in hours (default: 24)
//
// Exit codes:
//   0  count is below the limit (OK to merge)
//   1  count >= limit (rate-limited; refuse to merge)
//   2  error fetching/parsing data (defensive — also refuses)
//
// JSON shape expected (output of `gh pr list --json number,mergedAt,title`):
//   [
//     { "number": 117, "mergedAt": "2026-04-25T05:23:11Z", "title": "..." },
//     ...
//   ]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LIMIT = Number.parseInt(process.env.ADMIN_MERGE_LIMIT ?? "5", 10);
const WINDOW_HOURS = Number.parseInt(
  process.env.ADMIN_MERGE_WINDOW ?? "24",
  10,
);

const args = process.argv.slice(2);
const fromFileIdx = args.indexOf("--from-file");
const showJson = args.includes("--json");

/** @returns {Array<{number: number, mergedAt: string, title: string}>} */
function loadEntries() {
  if (fromFileIdx !== -1) {
    const path = args[fromFileIdx + 1];
    if (!path) {
      console.error("[check-admin-merge-rate] --from-file requires a path.");
      process.exit(2);
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }

  // Production path: query gh.
  const sinceMs = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString().replace(/\.\d+Z$/, "Z");
  let raw;
  try {
    raw = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--search",
        `author:@me merged:>=${sinceIso}`,
        "--json",
        "number,mergedAt,title",
        "--limit",
        "50",
      ],
      { encoding: "utf8" },
    );
  } catch (err) {
    console.error(
      `[check-admin-merge-rate] gh query failed: ${
        /** @type {Error} */ (err).message
      }`,
    );
    console.error("  Falling back to fail-closed: refusing the merge.");
    process.exit(2);
  }
  return JSON.parse(raw);
}

let entries;
try {
  entries = loadEntries();
} catch (err) {
  console.error(
    `[check-admin-merge-rate] Failed to load merge data: ${
      /** @type {Error} */ (err).message
    }`,
  );
  process.exit(2);
}

if (showJson) {
  console.log(JSON.stringify(entries, null, 2));
}

const count = entries.length;

if (count >= LIMIT) {
  console.error(
    `[check-admin-merge-rate] FAIL: ${count}/${LIMIT} admin self-merges in last ${WINDOW_HOURS}h.`,
  );
  console.error("");
  console.error("Recent merges:");
  for (const entry of entries.slice(0, 10)) {
    console.error(
      `  #${entry.number}  ${entry.mergedAt}  ${entry.title}`,
    );
  }
  console.error("");
  console.error("Above the rate limit. Either:");
  console.error("  - Batch follow-up work into one PR");
  console.error(
    `  - Wait for the ${WINDOW_HOURS}h window to roll (oldest merge will roll off)`,
  );
  console.error(
    "  - Human-only override: ALLOW_ADMIN_BURST=1 bash scripts/safe-admin-merge.sh <pr>",
  );
  console.error("");
  console.error(
    "Per taskgrind.md rule 7 + AGENTS.md \"Task queue conventions\".",
  );
  process.exit(1);
}

console.log(
  `[check-admin-merge-rate] ${count}/${LIMIT} admin self-merges in last ${WINDOW_HOURS}h. OK.`,
);
process.exit(0);
