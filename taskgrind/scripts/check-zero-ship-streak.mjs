#!/usr/bin/env node
// scripts/check-zero-ship-streak.mjs
//
// Pre-flight stop-condition check for autonomous taskgrind sessions.
// Implements taskgrind rule 10: detect when the audit cascade is
// exhausted or when 100% of TASKS.md is marked with `**Blocked**`, so
// the next-task skill can exit early instead of running another
// pointless audit pass.
//
// Reference deployment: a 22-session autonomous grind on
// `oncall-hub-api` (2026-04-24) ran 17 sessions after the queue first
// hit 100% blocked, generating ~10 single-finding
// doc-drift PRs. This script would have printed STOP from session 6
// onward, saving ~7 hours of model time.
//
// Usage:
//   node taskgrind/scripts/check-zero-ship-streak.mjs
//   (or copy to scripts/ in your repo and run from there)
//
// Configuration (env vars):
//   BASE          — base ref for `git log` (default: auto-detect
//                   between origin/master and origin/main, in that
//                   order; first one that exists wins).
//   TICKET_PREFIX — substring required in commit subjects to count as
//                   a doc-drift commit (default: empty — disabled).
//                   Set to your repo's ticket convention (e.g.
//                   "FOO-123") to scope the rule to a specific
//                   ticket family.
//   TASKS_PATH    — path to TASKS.md (default: TASKS.md)
//
// Output:
//   First line is `STOP` or `CONTINUE`. Following lines describe why.
//   Exit code is always 0 — this script is informational, not a gate.
//   The calling skill grep's the first line and decides what to do.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TICKET_PREFIX = process.env.TICKET_PREFIX ?? "";
const TASKS_PATH = resolve(process.cwd(), process.env.TASKS_PATH ?? "TASKS.md");

const CLOSES_PATTERN = /\bcloses\s+[a-z][a-z0-9-]+\b/i;

/** @param {string[]} args */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Auto-detect the base ref: prefer explicit BASE, then origin/master, then origin/main. */
function resolveBase() {
  const explicit = process.env.BASE;
  if (explicit) return explicit;
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
  // Neither exists; return the conventional default and let later git
  // calls fail gracefully (the script's defensive try/catch returns "").
  return "origin/master";
}

const BASE = resolveBase();

/**
 * Check 1 — last 3 commits on the base ref are all docs-only with no
 * `closes <task-id>` token (and optionally with the ticket prefix in
 * the subject). When this fires, the audit cascade has been hit
 * recently; more drift fixes won't unblock anything.
 *
 * @returns {{ commits: string[] } | null}
 */
function checkConsecutiveDocDrift() {
  const log = git(["log", "--format=%H", "-3", BASE]);
  const shas = log.split("\n").filter(Boolean);
  if (shas.length < 3) return null;

  const summaries = [];
  for (const sha of shas) {
    const message = git(["log", "-1", "--format=%B", sha]);
    const filesRaw = git([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      sha,
    ]);
    const files = filesRaw.split("\n").filter(Boolean);

    if (files.length === 0) return null;
    const allMd = files.every((file) => file.toLowerCase().endsWith(".md"));
    if (!allMd) return null;

    if (CLOSES_PATTERN.test(message)) return null;

    if (TICKET_PREFIX && !message.includes(TICKET_PREFIX)) return null;

    const subject = message.split("\n")[0] ?? "";
    summaries.push(`${sha.slice(0, 7)} ${subject}`);
  }

  return { commits: summaries };
}

/**
 * Split TASKS.md content into top-level task blocks. A block starts at
 * a `^- [ ]` line and ends at the next `^- [ ]`, the next `^# `–`^###### `
 * heading, or end-of-file.
 *
 * @param {string} content
 * @returns {string[][]}
 */
function parseTaskBlocks(content) {
  const lines = content.split("\n");
  /** @type {string[][]} */
  const blocks = [];
  /** @type {string[] | null} */
  let current = null;
  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };
  for (const line of lines) {
    if (/^- \[ \]/.test(line)) {
      flush();
      current = [line];
    } else if (/^#{1,6} /.test(line)) {
      flush();
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

/**
 * Check 2 — every P0–P3 task in TASKS.md carries a non-empty
 * `**Blocked**` metadata line. When this fires, the
 * autonomous queue is empty by safety contract; running the audit
 * cascade just produces busywork.
 *
 * @returns {{ totalTasks: number } | null}
 */
function checkAllBlockedMarked() {
  let content;
  try {
    content = readFileSync(TASKS_PATH, "utf8");
  } catch {
    return null;
  }

  const blocks = parseTaskBlocks(content);
  if (blocks.length === 0) return null;

  const blockedBlocks = blocks.filter((block) =>
    block.some((line) => /^\s+-\s+\*\*Blocked\*\*:\s*\S/i.test(line)),
  );
  if (blockedBlocks.length === blocks.length) {
    return { totalTasks: blocks.length };
  }
  return null;
}

const docDrift = checkConsecutiveDocDrift();
const allBlocked = checkAllBlockedMarked();

if (docDrift || allBlocked) {
  console.log("STOP");
  console.log("");
  if (docDrift) {
    console.log(
      `  Reason 1: last 3 commits on ${BASE} are docs-only with no \`closes <id>\` token`,
    );
    if (TICKET_PREFIX) {
      console.log(`            (filtered by TICKET_PREFIX="${TICKET_PREFIX}")`);
    }
    console.log("            — audit cascade is exhausted.");
    console.log("");
    console.log("  Recent commits:");
    for (const summary of docDrift.commits) {
      console.log(`    ${summary}`);
    }
    console.log("");
  }
  if (allBlocked) {
    console.log(
      `  Reason 2: 100% of TASKS.md tasks (${allBlocked.totalTasks}/${allBlocked.totalTasks}) carry`,
    );
    console.log("            a non-empty **Blocked** metadata line — no");
    console.log("            autonomous work available.");
    console.log("");
  }
  console.log(
    "  See taskgrind.md rule 10 + AGENTS.md \"Autonomous session stop-conditions\".",
  );
  console.log(
    "  Exit the session cleanly. The next session will re-run this check.",
  );
  process.exit(0);
}

console.log("CONTINUE");
console.log("");
console.log("  No stop-condition active. Proceed with the next-task workflow.");
process.exit(0);
