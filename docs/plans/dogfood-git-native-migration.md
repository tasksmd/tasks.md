# Plan: Dogfood git-native — consumer migration command + self-host flip

- **Task**: consumer-migration-command, dogfood-git-native-self-host
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: @devin session 2026-06-02
- **Status**: validated
- **Validated-by**: reviewer on 2026-06-02

## Goal

Ship a one-shot, agent-facing `/migrate` command that converts any file-backed repo to the git-native backend (the same `tasks migrate` + `fleet init` + verify path, orchestrated idempotently), then use that command to convert **this** repo's own queue to git-native (VISION G8). After the flip, `TASKS.md` is a generated snapshot, claims go through the `tasks-claims` ref, and the repo's own agent docs describe the git-native flow with no file-backend-only remains.

## Why

VISION G8 commits the canonical repo to running on the backend it recommends for collaborative repos; the conflict-free claim, conformance, and migration are only credible if proven on the project that defines them. The mechanics exist (`tasks migrate`, `tasks fleet init`, `tasks doctor`) but are unwired: `commands/setup.md` step 5 points fleets at `fleet init` **without** `migrate`, so a consumer with a populated `TASKS.md` would silently lose their queue (the log starts empty). A single command that sequences detect → dry-run → apply → fleet init → doctor → rollback removes that failure mode and makes "migrate every project" a one-prompt operation.

## Scope (in)

- `commands/migrate.md` — new canonical command source (detect → dry-run → apply → `fleet init` → `doctor` → rollback; idempotent; Node-optional note).
- `packages/cli/src/commands/generate-commands.ts` — add a `MIGRATE_CONFIG` (+ description constants + per-agent frontmatter) to `COMMANDS`; regenerate the 6 variants.
- `packages/cli/src/commands/install.ts` — add the migrate command's per-agent source/dest install entries.
- `packages/cli/src/commands/{generate-commands,install}.test.ts` — extend expectations for the new command.
- `commands/README.md`, `commands/setup.md` (step 5 references `/migrate`), `README.md`, `AGENTS.md` (command-propagation table) — wire the command in.
- The self-host flip: run the command on this repo → `.tasksmd.json {backend: git-native}`, `lefthook.yml`, `.github/workflows/tasks-snapshot.yml`, `.github/workflows/tasks-claim-check.yml`, imported `tasks-claims` log, regenerated `TASKS.md`.
- `AGENTS.md` + `CONTRIBUTING.md` — task-queue policy rewritten to the git-native claim/complete flow (no "hand-edit TASKS.md as source of truth").

## Scope addendum (user-directed, 2026-06-02)

During Phase 2 the dry-run revealed git-native does not model `blocked`/`blocked-by` (a deliberate v1 deferral), so the flip would make this repo's 2 blocked tasks pickable and drop their reason text. The operator chose the clean path: **model `blocked`/`blocked-by` in git-native first** (new prerequisite task `git-native-model-blocked-by`, which `dogfood-git-native-self-host` is now blocked by). That task's acceptance — fold + `next`/`claim` skip blocked, `render` round-trips `**Blocked**`/`**Blocked by**`, `migrate` preserves both, conformance `blockedBy: true` — is the gate before the flip runs.

## Scope (out)

- Rewriting VISION/README/user-stories/competitors for cold readers — the follow-on doc-rewrite request, done after this plan's tasks land.
- Migrating other repos — cross-repo, operator-driven via the shipped command (the repo policy forbids roaming beyond tasks.md).
- Making the claim-check a *required* GitHub ruleset check — operator action (documented in the threat model), not a repo file change.
- Any change to the file backend in the product (spec/examples/packages) — it stays the solo/offline default.

## Implementation steps

### Step 1: Build the `migrate` command + generator wiring

Author `commands/migrate.md`; add `MIGRATE_CONFIG` to `generate-commands.ts`; run `node packages/cli/dist/cli.js generate-commands`. Verify: `npm run build -w packages/cli && node packages/cli/dist/cli.js generate-commands` is clean and `git status commands/` shows the new canonical + 6 variants only.

### Step 2: Install entries + tests

Add the migrate source/dest rows to `install.ts` (all 6 agents: claude/codex skills, cursor/windsurf `.md`, devin skill, gemini `.toml` — mirroring the next-task entries). Update `generate-commands.test.ts` (assert `MIGRATE_CONFIG` is in `COMMANDS` and all 6 variants are emitted for `migrate`) and `install.test.ts` (assert the migrate install mappings exist for all 6 agents). Verify: `npx vitest run packages/cli/src/commands/generate-commands.test.ts packages/cli/src/commands/install.test.ts` passes.

### Step 3: Wire docs + verify Phase 1

- `commands/README.md`: add a new `### /migrate` section (and any per-command table row) documenting the command + its 6 per-agent install paths, parallel to the existing `/next-task` and `/lint-tasks` entries.
- `AGENTS.md` § "Command Propagation": add a third row to the propagation table for `commands/migrate.md` → its 6 generated variants (the table currently lists only next-task and lint-tasks).
- `commands/setup.md` step 5: rewrite the fleet sub-bullet so the migration path is explicit and queue-safe — *"For a **fleet** or any multi-contributor repo: run `/migrate` (or `tasks migrate --apply` then `tasks fleet init`) to import the current queue into the collision-free git-native backend, then `lefthook install`."* — so a populated `TASKS.md` is never lost by a bare `fleet init`.
- `README.md`: reference `/migrate` in the Backends section.

Verify: `npm run build && npm test && npm run lint && npx -y @tasks-md/lint TASKS.md` all pass; `node packages/cli/dist/cli.js generate-commands` then `git diff --exit-code commands/` is clean. Commit Phase 1; remove `consumer-migration-command` from TASKS.md.

### Step 4: Flip this repo with the command

First capture the pre-migration open set: `node packages/cli/dist/cli.js list --json > /tmp/before.json`. Then `tasks migrate` (dry-run, inspect output) → `tasks migrate --apply` → `tasks fleet init`. Verify: `tasks list` reproduces every id from `/tmp/before.json` (empty diff); `tasks doctor` exits 0 (all checks ok/warn); the projection workflow exists (`test -f .github/workflows/tasks-snapshot.yml`) and the claim-check workflow exists (`test -f .github/workflows/tasks-claim-check.yml`); the regenerated `TASKS.md` passes `npx -y @tasks-md/lint`. (CI runs the projection job on push to `tasks-claims`; locally we confirm the workflow is installed and `tasks render`/the generated snapshot lints — we do not execute the GitHub Action.)

### Step 5: Scrub file-backend-only remains + verify Phase 2

Rewrite the `AGENTS.md` + `CONTRIBUTING.md` task-queue policy to the git-native flow (claim via `tasks claim`, complete via `tasks complete`, never hand-edit the generated `TASKS.md`). Verify: `npm run lint` (incl. docs-backend-drift) passes; `tasks doctor` green; commit Phase 2; complete `dogfood-git-native-self-host` via `tasks complete dogfood-git-native-self-host`.

## Risks and mitigations

- **Risk: the flip loses the existing queue.** `fleet init` on an empty log without `migrate` starts with zero tasks.
  - Mitigation: the command runs `migrate --apply` *before* `fleet init`; Step 4 captures the pre-migration `tasks list` and asserts the post-migration list matches.
- **Risk: commands-drift CI fails because a generated variant wasn't regenerated.** Adding a 4th command multiplies the variant set.
  - Mitigation: regenerate via the generator (never hand-edit variants) and run `generate-commands` in CI-parity before commit; the `generate-commands.test.ts` pins the output.
- **Risk: docs-backend-drift guard fails after rewriting AGENTS.md/CONTRIBUTING.md.** The guard flags universal file-backend instructions.
  - Mitigation: the rewrite makes the instructions git-native (or backend-neutral), which is what the guard wants; run `npm run lint` before commit.
- **Risk: post-flip, my own doc-rewrite commits get blocked by the claim-check pre-push hook.** lefthook installs a path-scoped gate.
  - Mitigation: the gate is doc-only-exempt (`.md`/`.txt` pass without a claim); Phase 3 is all markdown. Code work (Phase 1) lands before the flip.
- **Risk: `tasks complete dogfood-git-native-self-host` can't run because the task isn't in the log.** It must be imported by `migrate --apply` while still in `TASKS.md`.
  - Mitigation: only `consumer-migration-command` is removed before the flip; `dogfood-git-native-self-host` stays in `TASKS.md` so it is imported, then completed via the CLI.

## Acceptance criteria

1. `commands/migrate.md` exists and `node packages/cli/dist/cli.js generate-commands` produces all per-agent variants with no `git status commands/` drift (`git diff --exit-code commands/` after regeneration).
2. `npm run build && npm test && npm run lint && npx -y @tasks-md/lint TASKS.md` all exit 0 after Phase 1.
3. After the flip, `cat .tasksmd.json` shows `"backend": "git-native"` and `node packages/cli/dist/cli.js doctor` exits 0.
4. `node packages/cli/dist/cli.js list` after the flip lists every task id that was open in `TASKS.md` before it (diff of the two id sets is empty).
5. `grep -ci "hand-edit\|append.*(@" AGENTS.md CONTRIBUTING.md` finds no instruction to hand-edit TASKS.md as the source of truth (manual read confirms the policy is the git-native flow), and `npm run lint` (docs-backend-drift) passes.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->

- **Verdict**: approved
- **Reviewer**: reviewer
- **Date**: 2026-06-02
- **Concerns**:
  - (none — all 5 concerns from the first review pass were folded into Steps 2–5)
- **Approval rationale**:
  - The revised plan explicitly specifies the commands/README.md `### /migrate` section, the AGENTS.md command-propagation row, the queue-safe setup.md step-5 rewrite, projection + claim-check workflow verification, and the generate-commands/install test assertions. Sequencing (code → flip → docs) is sound, risks are mitigated, and acceptance criteria are deterministic.
