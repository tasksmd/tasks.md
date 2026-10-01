#!/usr/bin/env node
// Pattern: deterministic gate over a PR-body convention.
// Source: agentbrew rule `pr-vision-trace` (sibling of `load-project-context`);
//   inspired by minsky's `check-pr-self-grade.mjs` (Munafò et al. 2017 pre-
//   registered HDD discipline — pre-registration without observation-vs-
//   prediction is half a rule).
// Conformance: full — pure shape check on the PR body, no LLM in the chain.
//
// Why this gate exists: agents in agent-shaped sessions can land changes
// that don't trace back to VISION goals or user stories. The
// `load-project-context` rule (shipped via agentbrew shared-rules.md +
// SessionStart hook) auto-loads the canonical docs into every session, but
// it doesn't force the agent to USE them when proposing changes. This
// gate makes the trace structurally unavoidable: a PR body without a
// vision-trace block fails CI.
//
// Required PR-body shape (case-insensitive, must appear in this order
// inside a single contiguous block headed by `Vision trace`):
//
//   ## Vision trace
//   - Vision goal: <VISION.md section, goal id, or N/A — <reason ≥3 chars>>
//   - User story: <user-stories/<id>.md, US-NN, or N/A — <reason ≥3 chars>>
//   - Competitor prior art: <competitor name + what they ship, or
//     N/A — <reason ≥3 chars>>
//
// All three field values must be non-empty (≥3 characters of substantive
// text). Missing block, missing line, or empty cell → exit 1 with a
// pointer to VISION.md + ROADMAP/MILESTONES.md.
//
// Opt-out: PR body may include the marker
//   <!-- vision-trace: not-applicable — <reason ≥3 chars> -->
// to skip the check (e.g. release-bot commits, lockfile bumps, mirror-
// sync auto-commits). The marker must include a non-empty reason.
//
// Pivot (rule #9): if this gate produces ≥3 false positives in its first
// month (legitimate PRs blocked by formatting), broaden the field regex
// to accept multi-line values (current shape is single-line per field).

// `[ \t]*` (NOT `\s*`) keeps each match on a single line — `\s*` would span
// newlines and accidentally grab the next field's value when the current
// line's value is empty.
const HEADER_RE = /^#+[ \t]*vision[- ]?trace\b/im;
const OPTOUT_RE = /<!--[ \t]*vision[- ]?trace:[ \t]*not[- ]?applicable[ \t]*[—\-:][ \t]*(.+?)[ \t]*-->/i;
const FIELD_RES = {
  "Vision goal": /^[ \t]*[-*•]?[ \t]*(?:\*\*)?vision[- ]?goal(?:\*\*)?[ \t]*[:\-][ \t]*(.+)$/im,
  "User story": /^[ \t]*[-*•]?[ \t]*(?:\*\*)?user[- ]?stor(?:y|ies)(?:\*\*)?[ \t]*[:\-][ \t]*(.+)$/im,
  "Competitor prior art": /^[ \t]*[-*•]?[ \t]*(?:\*\*)?competitor[- ]?(?:prior[- ]?art|check)(?:\*\*)?[ \t]*[:\-][ \t]*(.+)$/im,
};

const MIN_VALUE_LEN = 3;

/**
 * @typedef {{ ok: true, reason?: string } | { ok: false, errors: string[] }} CheckResult
 */

/**
 * Check one field's regex against the body.
 *
 * @param {string} name
 * @param {RegExp} re
 * @param {string} body
 * @returns {string | null} error string, or null if OK
 */
function checkField(name, re, body) {
  const m = body.match(re);
  if (!m) return `missing or malformed line: \`- ${name}: …\``;
  const value = m[1].trim().replace(/[*_`]+$/g, "").trim();
  if (value.length < MIN_VALUE_LEN) {
    return `\`${name}\` value is too short (need ≥${MIN_VALUE_LEN} chars, got "${value}")`;
  }
  return null;
}

/**
 * @param {string} body
 * @returns {CheckResult}
 */
export function checkPrVisionTrace(body) {
  // Opt-out marker — bypasses the block requirement.
  const optout = body.match(OPTOUT_RE);
  if (optout) {
    const reason = optout[1].trim();
    if (reason.length < MIN_VALUE_LEN) {
      return {
        ok: false,
        errors: [
          `opt-out marker \`<!-- vision-trace: not-applicable — <reason> -->\` has an empty or too-short reason (need ≥${MIN_VALUE_LEN} chars)`,
        ],
      };
    }
    return { ok: true, reason: `opt-out: ${reason}` };
  }

  const errors = [];
  if (!HEADER_RE.test(body)) {
    errors.push("missing `## Vision trace` header (case-insensitive)");
  }
  for (const [name, re] of Object.entries(FIELD_RES)) {
    const err = checkField(name, re, body);
    if (err) errors.push(err);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

const REQUIRED_BLOCK_TEMPLATE = `## Vision trace

- **Vision goal**: <VISION.md section name, goal id, or \`N/A — <reason>\`>
- **User story**: <\`user-stories/<id>.md\`, \`US-NN\`, or \`N/A — <reason>\`>
- **Competitor prior art**: <competitor name + what they ship, or \`N/A — <reason>\`>

Opt-out for release bots / lockfile bumps / mirror-sync commits:

    <!-- vision-trace: not-applicable — <reason ≥3 chars> -->`;

// CLI entry: read PR body from argv[2], lint, exit 0 or 1.
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: check-pr-vision-trace.mjs <pr-body-file>");
    process.exit(2);
  }
  const fs = await import("node:fs");
  const body = fs.readFileSync(path, "utf8");
  const result = checkPrVisionTrace(body);
  if (!result.ok) {
    console.error("pr-vision-trace violation:");
    for (const e of result.errors) console.error(`  - ${e}`);
    console.error("");
    console.error("Required block (paste into PR description):");
    console.error("");
    for (const line of REQUIRED_BLOCK_TEMPLATE.split("\n")) {
      console.error(`  ${line}`);
    }
    console.error("");
    console.error(
      "See VISION.md + ROADMAP.md (or MILESTONES.md) in the repo root for goals + roadmap.",
    );
    console.error(
      "See docs/competitors/ (or competitors/) for the per-competitor analysis to cite.",
    );
    console.error(
      "See the `load-project-context` agentbrew rule (in shared-rules.md) for the canonical-doc layout this gate references.",
    );
    process.exit(1);
  }
  if (result.reason) console.log(`pr-vision-trace: ${result.reason}`);
  else console.log("pr-vision-trace: ok");
  process.exit(0);
}
