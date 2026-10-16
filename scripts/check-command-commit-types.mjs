#!/usr/bin/env node
// Guard: the canonical command sources (commands/*.md) must only prescribe
// commit subjects whose type is a standard Conventional Commits type.
//
// A command once told agents to commit as `plan: ...`, and repos that run
// @commitlint/config-conventional rejected it. This check turns that bug into
// a rule. It reads two shapes:
//   • `git commit -m "<subject>"` (or single quotes);
//   • a backtick span such as `chore: block <id>` on a line that mentions
//     "commit", so spans like `backend: git-native` elsewhere are ignored.
// Placeholders such as `<type>: ...` are skipped.
//
// Run: `node scripts/check-command-commit-types.mjs`.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// @commitlint/config-conventional type-enum.
export const STANDARD_TYPES = new Set([
  "build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test",
]);

const SUBJECT_RE = /^([a-z]+)(?:\([^)]*\))?!?: \S/;
const GIT_COMMIT_RE = /git commit[^\n]*?-m\s+(["'])(.+?)\1/g;
const BACKTICK_RE = /`([^`\n]+)`/g;

/** Every prescribed commit subject in `text`, with its 1-based line. */
export function prescribedSubjects(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    const candidates = [...line.matchAll(GIT_COMMIT_RE)].map((m) => m[2]);
    if (/commit/i.test(line)) {
      candidates.push(...[...line.matchAll(BACKTICK_RE)].map((m) => m[1]));
    }
    for (const subject of new Set(candidates)) {
      const match = SUBJECT_RE.exec(subject);
      if (match) found.push({ line: index + 1, subject, type: match[1] });
    }
  });
  return found;
}

/** Errors for non-standard types in `<root>/commands/*.md`. */
export function checkCommandCommitTypes(root) {
  const dir = join(root, "commands");
  if (!existsSync(dir)) return [];
  const errors = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const text = readFileSync(join(dir, name), "utf-8");
    for (const { line, subject, type } of prescribedSubjects(text)) {
      if (!STANDARD_TYPES.has(type)) {
        errors.push(
          `commands/${name}:${line}: commit subject "${subject}" uses type "${type}"; use one of ${[...STANDARD_TYPES].join(", ")}`,
        );
      }
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkCommandCommitTypes(fileURLToPath(new URL("..", import.meta.url)));
  if (errors.length > 0) {
    console.error(`✗ non-standard commit types in command sources:\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("✓ command sources prescribe only standard commit types");
}
