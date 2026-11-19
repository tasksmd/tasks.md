// Rule-#9 pre-registration lint — opt-in.
//
// Enforces presence of the five rule-#9 fields on every top-level task
// block: **Hypothesis**, **Success** (or **Acceptance** — equivalent
// for "criterion for done"), **Pivot**, **Measurement**, **Anchor**.
//
// Rule-#9 is the pre-registration pattern: declare what observable a
// non-trivial change is expected to move *before* the code is written.
// This prevents post-hoc fishing for flattering metrics (Munafò et al.
// 2017) and pre-registers the give-up criterion (Ries 2011, pivot-or-
// persevere). Originating implementation: [Minsky](https://github.com/
// fyodoriv/minsky) `vision.md` § 9.
//
// The lint is OPT-IN — pass `--require-prereg` to enable it. Most
// TASKS.md files won't want every task pre-registered; the rule is for
// teams that want machine-enforced rule-#9 discipline.
//
// Grandfathering: legacy task IDs (filed before rule-#9 adoption) can
// be allowlisted via `--prereg-allowlist=<file>`. The file is one ID
// per line; lines starting with `#` are comments. Allowlisted tasks
// still surface in the count summary so the operator can see the
// remaining backfill debt.

import { readFileSync } from "node:fs";

export interface Rule9TaskBlock {
  /** Kebab-case task ID parsed from `**ID**: <id>` */
  id: string;
  /** Full block text including the ID line through the next ID or EOF */
  body: string;
  /** Fields the block is missing — e.g. `["Pivot", "Anchor"]` */
  missingFields: readonly string[];
}

/**
 * Pure function. Returns one entry per task block detected by an
 * `**ID**: <id>` line. Blocks without an ID line are silently skipped
 * (the spec doesn't require IDs, and a task with no ID can't be
 * grandfathered — surface those via the existing ID lint instead).
 */
export function parseRule9Blocks(tasksMd: string): readonly Rule9TaskBlock[] {
  const out: Rule9TaskBlock[] = [];
  const idRe = /^\s*-\s*\*\*ID\*\*:\s*([a-z0-9][a-z0-9-]*[a-z0-9])\s*$/gm;
  const heads: { id: string; start: number }[] = [];
  for (;;) {
    const m = idRe.exec(tasksMd);
    if (m === null) break;
    if (m[1] === undefined) continue;
    heads.push({ id: m[1], start: m.index });
  }
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    if (head === undefined) continue;
    const next = heads[i + 1];
    const end = next === undefined ? tasksMd.length : next.start;
    const body = tasksMd.slice(head.start, end);
    out.push({ id: head.id, body, missingFields: missingFieldsIn(body) });
  }
  return out;
}

function missingFieldsIn(body: string): string[] {
  const missing: string[] = [];
  if (!body.includes("**Hypothesis**:")) missing.push("Hypothesis");
  if (!(body.includes("**Success**:") || body.includes("**Acceptance**:"))) {
    missing.push("Success/Acceptance");
  }
  if (!body.includes("**Pivot**:")) missing.push("Pivot");
  if (!body.includes("**Measurement**:")) missing.push("Measurement");
  if (!body.includes("**Anchor**:")) missing.push("Anchor");
  return missing;
}

function fieldValue(body: string, name: string): string | undefined {
  const m = new RegExp(`\\*\\*${name}\\*\\*:\\s*(.*)`).exec(body);
  return m?.[1]?.trim();
}

/**
 * Pure function. Non-blocking quality warnings for a block that has the
 * fields: a Measurement with no runnable command in backticks, a Pivot
 * that repeats the Success threshold, and an Anchor with no primary
 * source (no year, URL, or DOI). Ported from minsky's experiment lints.
 */
export function qualityWarningsIn(body: string): string[] {
  const warnings: string[] = [];
  const measurement = fieldValue(body, "Measurement");
  if (measurement !== undefined && !/`[^`]+`/.test(measurement)) {
    warnings.push("Measurement has no runnable command in backticks");
  }
  const success = fieldValue(body, "Success") ?? fieldValue(body, "Acceptance");
  const pivot = fieldValue(body, "Pivot");
  if (success !== undefined && pivot !== undefined && success.length > 0 && success === pivot) {
    warnings.push("Pivot repeats the Success threshold; give it its own lower threshold");
  }
  const anchor = fieldValue(body, "Anchor");
  if (anchor !== undefined && !/(\b(19|20)\d{2}\b|https?:\/\/|\b10\.\d{4,}\/)/.test(anchor)) {
    warnings.push("Anchor names no primary source (author and year, URL, or DOI)");
  }
  return warnings;
}

export interface Rule9Classification {
  /** Blocks missing fields that are NOT in the allowlist — these block the lint */
  blocking: readonly Rule9TaskBlock[];
  /** Blocks missing fields that ARE in the allowlist — surface but don't block */
  grandfathered: readonly Rule9TaskBlock[];
  /** Count of blocks that have all five fields */
  clean: number;
}

export function classifyRule9Blocks(
  blocks: readonly Rule9TaskBlock[],
  allowlist: ReadonlySet<string>,
): Rule9Classification {
  const blocking: Rule9TaskBlock[] = [];
  const grandfathered: Rule9TaskBlock[] = [];
  let clean = 0;
  for (const b of blocks) {
    if (b.missingFields.length === 0) {
      clean++;
      continue;
    }
    if (allowlist.has(b.id)) grandfathered.push(b);
    else blocking.push(b);
  }
  return { blocking, grandfathered, clean };
}

/**
 * Parse an allowlist file. One ID per line; blank lines and lines
 * starting with `#` are ignored. The file format is identical to a
 * .gitignore-style "list of names" so editors can stack-sort cleanly.
 */
export function parseAllowlistFile(path: string): ReadonlySet<string> {
  const text = readFileSync(path, "utf-8");
  return new Set(
    text
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.length > 0),
  );
}

export interface Rule9LintReport {
  blocksScanned: number;
  clean: number;
  grandfathered: number;
  blocking: readonly Rule9TaskBlock[];
  /** Non-blocking quality warnings for blocks that have every field */
  warnings: readonly { id: string; messages: readonly string[] }[];
}

/**
 * Run the rule-#9 lint over an already-loaded file's contents. Returns
 * a structured report so the CLI can format a single summary line and
 * the per-block error lines uniformly with the rest of the lint output.
 */
export function lintRule9Content(
  tasksMd: string,
  allowlist: ReadonlySet<string>,
): Rule9LintReport {
  const blocks = parseRule9Blocks(tasksMd);
  const { blocking, grandfathered, clean } = classifyRule9Blocks(blocks, allowlist);
  return {
    blocksScanned: blocks.length,
    clean,
    grandfathered: grandfathered.length,
    blocking,
    warnings: blocks
      .filter((b) => b.missingFields.length === 0)
      .map((b) => ({ id: b.id, messages: qualityWarningsIn(b.body) }))
      .filter((w) => w.messages.length > 0),
  };
}
