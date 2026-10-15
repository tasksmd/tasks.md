# Plan: Ship /review-tasks and lint bare or duplicate task fields

- **Task**: ship-review-tasks-and-lint-bare-or-duplicate-task-fields
- **Repo**: ~/apps/tooling/tasks.md
- **Author**: claude-opus session 2026-10-15
- **Status**: implemented
- **Validated-by**: claude-opus on 2026-10-15 (validated against a live review of agentbrew and dotfiles queues; see Evidence)

## Overall goal and vision

Queue owners need a repeatable way to check that every open task is still true, useful, and at the right priority. A hand review of two real queues (agentbrew, 116 tasks; dotfiles, 44 tasks) on 2026-10-15 found that roughly a third were already done, obsolete, duplicated, misfiled, or at the wrong priority. Format lint passed on both files, so lint alone does not catch queue rot. The durable capability is a shared `/review-tasks` command for every agent, plus two lint rules for the structural bugs the review uncovered.

## Decision and alternatives

- **Selected:** a canonical command source (`commands/review-tasks.md`) generated for every agent, like `/next-task` and `/lint-tasks`. It drives the spec's existing `review` operation (list / reprioritize / groom) and uses `tasks list --json` for the inventory, so no new CLI verb is needed (rule 3).
- **Alternative: a `tasks review` CLI command.** Rejected for now. The valuable part is judgment against code and history, which an agent does and a deterministic CLI cannot. `tasks list --json` already supplies the inventory.
- **Alternative: lint-only.** Rejected. Both real queues passed lint while holding stale work.

## Evidence and current state

| Claim | Current source of truth | How it is provided | Status |
| --- | --- | --- | --- |
| Lint passes on queues with stale work | `node packages/lint/dist/cli.js ~/apps/tooling/agentbrew/TASKS.md` → 0 errors before this change | local run | fact |
| Bare `**Field**:` lines are invisible to the parser | `packages/parser/src/index.ts:182` matches only `- **Field**:` | code | fact |
| A lost `- [ ]` line merges two tasks silently | agentbrew TASKS.md:186 (second `**ID**` under one task) | live file | fact |
| The spec already defines a `review` operation | `spec.md:591` | spec | fact |

## Scope (in)

- `commands/review-tasks.md` and its generated variants.
- Generator registration and tests.
- Lint: bare-field error (auto-fixed by `--fix`) and duplicate top-level field error, with tests.
- Docs: commands README, ARCHITECTURE, AGENTS, editing rules, lint and CLI READMEs.

## Scope (out)

- `tasks install` still installs only `/next-task` (same as the other commands today).
- No new CLI verb.

## Boundary contracts (when applicable)

None. The command is markdown; the lint rules add errors with stable message prefixes.

## Numbered work breakdown

1. Write the canonical command (why: shared rubric; acceptance: generated for 4 agents).
2. Register it in `generate-commands.ts` and test it (depends on 1).
3. Add both lint rules and tests (independent).
4. Update docs (depends on 1–3).

## Risks and mitigations

- **New lint errors break adopters' CI.** Mitigation: the bare-field error is auto-fixable with `--fix`; the duplicate-field error flags real data loss (the parser keeps one value).
- **False positives on nested notes.** Mitigation: only top-level fields (2–3 spaces of indent) count; a test covers nested bullets.

## Acceptance criteria

- `npm run build`, `npm test`, and `npm run lint` pass.
- The linter reports the agentbrew orphan block (duplicate `**ID**` at line 186) and the bare fields.
- `generate-commands` writes four `review-tasks` variants.

## Rollout and regression coverage

Ships with the next tasks.md release. Tests in `packages/lint/src/lint.test.ts` and `packages/cli/src/commands/generate-commands.test.ts`.

## Reviewer verdict

approved — the rubric was exercised end to end on two real queues before it was written down, and the lint rules were measured on five real queues (agentbrew, dotfiles, minsky, taskgrind, tasks.md) with no false positives found.
