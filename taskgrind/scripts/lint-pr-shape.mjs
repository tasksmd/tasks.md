#!/usr/bin/env node
// scripts/lint-pr-shape.mjs
//
// Enforces taskgrind.md rule 9 / AGENTS.md "Task queue conventions":
// every PR is either
//   (a) substantive — the diff contains at least one non-`.md` file, OR
//   (b) structural — at least one `.md` file is added/deleted/renamed
//       (creating a new doc page or removing one is a deliberate
//       structural choice, not drift), OR
//   (c) closes a task — the HEAD commit message contains
//       `closes <kebab-case-id>`, OR
//   (d) a doc-drift batch — the diff modifies >=3 distinct markdown
//       files.
//
// Single-finding docs-only PRs (one stale port, one stale link, one
// stale path) are not acceptable — they fragment the git log and burn
// review/build cycles. The 2026-04-24 taskgrind shipped ~10 of these.
//
// Usage:
//   node scripts/lint-pr-shape.mjs [--base <ref>]
//
// Default base: origin/master.
//
// Emergency override (human operator only — autonomous agents MUST NOT
// set this):
//   ALLOW_SINGLE_DOC_PR=1 node scripts/lint-pr-shape.mjs
//
// Exit codes:
//   0  OK (substantive, closes-token, batched, or skipped)
//   1  FAIL — docs-only PR with no task closure and <3 findings
//
// CI integration: this script needs git history reaching the merge-base
// with the target branch. In GitHub Actions, set
//   - uses: actions/checkout@v4
//     with: { fetch-depth: 0 }
// so the merge-base lookup succeeds. If the merge-base can't be found
// (shallow clone, fresh worktree, etc.), the script skips the check and
// exits 0 — fail-open is correct here because false positives would be
// worse than missed catches given the manual-override path exists.

import { execFileSync } from "node:child_process";

/** Auto-detect the base ref: prefer --base flag, then origin/master, then origin/main. */
function resolveBase(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base" && args[i + 1]) {
      return args[i + 1];
    }
  }
  for (const candidate of ["origin/master", "origin/main"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", candidate], {
        stdio: "ignore",
      });
      return candidate;
    } catch {
      // not present, try next
    }
  }
  return "origin/master";
}

const args = process.argv.slice(2);
const base = resolveBase(args);

if (process.env.ALLOW_SINGLE_DOC_PR === "1") {
  console.log(
    "[lint-pr-shape] ALLOW_SINGLE_DOC_PR=1 set — skipping check (human override).",
  );
  process.exit(0);
}

/** @param {string[]} cmdArgs */
function git(cmdArgs) {
  return execFileSync("git", cmdArgs, { encoding: "utf8" }).trim();
}

// Step 1 — Find merge-base with the target branch. Skip the check
// gracefully if we can't (shallow clone, branch points off-tree, etc.).
let mergeBase;
try {
  mergeBase = git(["merge-base", base, "HEAD"]);
} catch {
  console.log(
    `[lint-pr-shape] Cannot find merge-base with ${base} (shallow clone or unrelated history). Skipping check.`,
  );
  process.exit(0);
}

// Step 2 — List changed files with status (A/M/D/R/C) in the PR diff.
const statusOutput = git([
  "diff",
  "--name-status",
  "--find-renames",
  `${mergeBase}..HEAD`,
]);
const fileChanges = statusOutput
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => {
    // Format: "<status>\t<path>" or "R<score>\t<old>\t<new>" for renames.
    const parts = line.split("\t");
    const status = parts[0]?.[0] ?? "M";
    // For renames/copies, use the new path (last token).
    const path = parts[parts.length - 1] ?? "";
    return { status, path };
  });

if (fileChanges.length === 0) {
  console.log("[lint-pr-shape] No changes vs base. Nothing to check.");
  process.exit(0);
}

// Step 3 — Substantive PR (any non-`.md` file)? Pass.
const nonMdFiles = fileChanges.filter(
  (change) => !change.path.toLowerCase().endsWith(".md"),
);
if (nonMdFiles.length > 0) {
  console.log(
    `[lint-pr-shape] Substantive PR — ${nonMdFiles.length} non-markdown file(s) changed. OK.`,
  );
  process.exit(0);
}

// Step 4 — Structural markdown change (added / deleted / renamed)? Pass.
// Drift fixes are always Modifications. New doc pages, removed ones, or
// renames are structural decisions worth their own PR even if single-file.
const structuralChange = fileChanges.find(
  (change) => change.status !== "M",
);
if (structuralChange) {
  console.log(
    `[lint-pr-shape] Structural markdown change (${structuralChange.status} ${structuralChange.path}). OK.`,
  );
  process.exit(0);
}

// Step 5 — All changes are `.md` modifications. Does the HEAD commit
// message close a task?
const headMessage = git(["log", "-1", "--format=%B"]);
const closesPattern = /\bcloses\s+[a-z][a-z0-9-]+\b/i;
if (closesPattern.test(headMessage)) {
  console.log("[lint-pr-shape] Docs-only PR closes a task. OK.");
  process.exit(0);
}

// Step 6 — No task closure. Are >=3 distinct markdown files modified?
if (fileChanges.length >= 3) {
  console.log(
    `[lint-pr-shape] Docs-only PR batches ${fileChanges.length} markdown findings. OK.`,
  );
  process.exit(0);
}

// Step 7 — Fail. Docs-only modifications, no closure, fewer than 3 findings.
const message = [
  "",
  `[lint-pr-shape] FAIL: docs-only PR with ${fileChanges.length} finding(s) and no task closure.`,
  "",
  "Files changed:",
  ...fileChanges.map((change) => `  ${change.status}  ${change.path}`),
  "",
  "To pass, do one of:",
  "  (a) Close a TASKS.md task — include `closes <task-id>` in the",
  "      HEAD commit message.",
  "  (b) Batch >=3 distinct doc-drift findings into one commit.",
  "  (c) If a structural change makes sense (new doc page, doc rename),",
  "      do that instead of a one-line edit.",
  "",
  "Per `taskgrind.md` rule 9 + AGENTS.md Task queue conventions.",
  "",
  "Emergency override (human operator only — autonomous agents must NOT set):",
  "  ALLOW_SINGLE_DOC_PR=1 yarn lint:pr-shape",
  "",
];
for (const line of message) console.error(line);
process.exit(1);
