# Plan: tasks.md meets every new-project requirement (or waives it with a reason)

- **Task**: tasks-md-meets-every-new-project-requirement-or-waives-it-wi
- **Repo**: ~/apps/tooling/tasks.md
- **Author**: claude session 2026-10-16
- **Status**: validated
- **Validated-by**: general-purpose reviewer subagent on 2026-10-16 (second pass: approved)

## Overall goal and vision

Contributors and agents should be able to measure their work in this repo:
how fast the gate is, whether a user story broke, and whether the project is
moving toward its adoption goal. The agentbrew `new-project` skill lists 10
required areas (vision, metrics, observability, user-stories, setup, e2e,
self-improving, tasks, checkup, caching) and scores them with
`check-setup.sh`. The 2026-10-16 audit scored this repo 7/24 (29%). The
target is 100%. Each area is met, mapped in `.agents/requirements.yaml` to a
file that truly meets it, or waived there with a reason a reviewer accepts.

## Pre-registration

- **Hypothesis**: meeting the areas makes contributor and agent work measurable; the setup score rises from 7/24 (29%) to 24/24 (100%), mapped or waived honestly.
- **Measurement**: `bash ~/.claude/skills/new-project/scripts/check-setup.sh . --profile tool`
- **Success**: 100%, with no waiver whose reason is effort; the gate wall time does not grow by more than 20% (`.metrics/events.jsonl` once it exists).
- **Pivot**: an area that takes more than 2 hours, or needs network or secrets in tests, becomes a reasoned waiver, a split P0 task, or a requirement-change PR on agentbrew new-project.
- **Anchor**: agentbrew `skill-plugins/workflow/new-project/references/owner-practices.md`; Basili, Caldiera, Rombach 1994 (GQM).

## Decision and alternatives

- **Map to the repo's own files** where they already meet an area (root
  `VISION.md`, `tasks doctor`, `scripts/check-docs-contract.mjs`). Copying
  them into the scaffold paths (`docs/VISION.md`, `scripts/doctor.sh`) would
  create two sources of truth.
- **Caching: Turborepo** across `packages/*` plus root tasks for the lint
  scripts. Alternatives: Nx (heavier, more config) and the owner's
  `cached-run` (one whole-command hash, not per package). Turborepo hashes
  each task's inputs, so a change re-runs only what it touches, and
  `--force` (`NO_CACHE=1`) runs everything.
- **JSONL events only for long-running parts** (`tasks watch`, `tasks-mcp`,
  fleet claims). Accepted push back: short commands print their result and
  exit; a log adds nothing.
- **No external error reporter.** Accepted push back: a local CLI never
  phones home. Errors go to the local JSONL log and name the user story they
  break.
- **US02 and US08 are writing guidance**, so lint fixture tests cover them,
  not e2e tests.

## Evidence and current state

| Claim | Current source of truth | How it is provided | Status |
| --- | --- | --- | --- |
| Score is 7/24 (29%) | `check-setup.sh . --profile tool` | run 2026-10-16 | fact |
| `--require-prereg` exists but is off | `packages/lint/src/rule9.ts`, `package.json` lint script | opt-in flag | fact |
| No task had the 5 prereg fields (stale `main` snapshot, 2026-10-16) | `node packages/lint/dist/cli.js --require-prereg TASKS.md` | 14 blocking before PR 1; 5 clean after | historical |
| `main`'s `TASKS.md` has no freshness promise | `docs/plans/decide-projection-to-main-snapshot-freshness.md` | manual refresh | fact |
| `tasks doctor` is the health check | `packages/cli/src/commands/doctor*` | `✓`/`⚠`/`✗` lines | fact |
| gitleaks is installed on the owner Mac | `which gitleaks` | Homebrew | fact |

## Scope (in)

Ordered as in the task body. `.agents/requirements.yaml` starts in PR 1 and
each PR adds the map or waiver lines for the areas it covers, so every PR
shows its areas green. Maps name file paths only, never commands.

| PR | Gap items | Areas it turns green | Check after the PR |
|---|---|---|---|
| 1 | 1, 2, 16 | tasks (prereg), secrets, docs (map to `docs/README.md` + `scripts/check-docs-contract.mjs`), tool (a real `CHANGELOG.md`) | rule-#9 `blocking=0`; `[secrets]`, `[docs]`, `[tool]` PASS |
| 2 | 3, 4 | vision (map `VISION.md`), metrics (map `docs/metrics.md` + `scripts/metrics.sh`) | `[vision]`, `[metrics]` PASS |
| 3 | 5, 6 | setup (map `scripts/setup.sh` + `CONTRIBUTING.md`) | `[setup]` PASS; `tasks init --install` output ends with `tasks doctor` |
| 4 | 7 | user-stories (map `docs/user-stories/`) | drift check fails on a story without `Metric:`/`Tests:` |
| 5 | 8, 9 | e2e (`scripts/e2e.sh`, `tests/e2e/`) | `[e2e]` PASS; `bash scripts/e2e.sh` exit 0 |
| 6 | 10, 11 | observability (`docs/observability.md`, map `scripts/doctor.sh` wrapper) | `[observability]` PASS; every doctor `⚠`/`✗` line has a `fix:` |
| 7 | 12, 13, 14 | checkup, caching, self-improving | `[checkup]`, `[caching]`, `[self-improving]` PASS; second `scripts/check.sh` run is all cache hits |
| 8 | 15 | decisions | `[decisions]` PASS (gap 16, the generated CHANGELOG, landed in PR 1) |

### Turborepo shape (PR 7)

- Workspace tasks `build` (outputs `dist/**`) and `test` (dependsOn `build`, `^build`).
- Root tasks `//#lint` (dependsOn `lint#build` and `cli#build`; inputs `TASKS.md`, `docs/**`, `scripts/**`, `examples/**`, `commands/**`, `*.md`, `package.json`).
- `.turbo/` and `.metrics/` in `.gitignore`; telemetry off (`TURBO_TELEMETRY_DISABLED=1`).
- `test:cached` (`cached-run`) is removed so one cache owns the gate.

### Snapshot vs the prereg lint

`main`'s `TASKS.md` is refreshed only by a person (see
`decide-projection-to-main-snapshot-freshness.md`). The snapshot job also runs
`--require-prereg` on its render and prints a warning naming the task, and
`npm run checkup` lints the live render. So a task filed without the fields is
caught before the next refresh PR, not by a red `main`.

### Stranger e2e (PR 5)

`npm pack` every workspace package together, install all tarballs into an
empty temp repo in one `npm install`, then run `tasks init` and `tasks doctor`.
Third-party dependencies still come from the registry, so the test runs in
`scripts/e2e.sh` and CI, not in the per-commit gate.

## Scope (out)

- Releases and version bumps (tasks `land-0-10-3-…`, `release-v0-11-0-…`).
- An external error reporter (accepted push back).
- Per-test affected-only selection (owner-practices: only after metrics show a slow step).

## Numbered work breakdown

### 1. Pre-registered tasks and secret hygiene

- **Why:** the `tasks` area needs every task pre-registered; secrets must never be committed.
- **Parallelism:** first; later PRs rebase on it.
- **Owner / boundary:** this repo.
- **Change:** `tasks update --body` on each open task; lint flag; `.gitignore`; `lefthook.yml` gitleaks step.
- **Evidence / acceptance:** the rule-#9 lint reports `blocking=0`.
- **Verification:** `npm run lint`

### 2–8

Each follows the same shape; the verification for each is
`bash ~/.claude/skills/new-project/scripts/check-setup.sh . --profile tool`
showing its area as PASS or mapped, plus `npm run lint` and `npm test`.

## Risks and mitigations

- **Risk: a stale `main` snapshot fails the new prereg lint.** A task filed without the fields lands in the snapshot later.
  - Mitigation: the snapshot job warns with the task ID and `npm run checkup` lints the live render; if both are missed, the first failure lands on the human snapshot-refresh PR, and the fix is one `tasks update`.
- **Risk: Turborepo caches a stale result.** A missing input in `turbo.json` would skip a needed re-run.
  - Mitigation: inputs default to every tracked file in the package; root tasks list their inputs; `NO_CACHE=1` forces a full run; CI runs without a warm cache.
- **Risk: the stranger-install e2e is slow or needs network.**
  - Mitigation: it installs all `npm pack` tarballs together from disk; third-party dependencies still come from the registry, so it runs in `scripts/e2e.sh` and CI, not the per-commit gate.
- **Risk: a map claims more than the file delivers.**
  - Mitigation: every map is quoted in the PR body and re-read by the monthly audit.

## Acceptance criteria

1. `bash ~/.claude/skills/new-project/scripts/check-setup.sh . --profile tool` exits 0 with `100%`.
2. `npm run lint` and `npm test` exit 0.
3. `node packages/lint/dist/cli.js --require-prereg TASKS.md` reports `blocking=0`.
4. `NO_CACHE=1 bash scripts/check.sh` runs every step; a second plain run reports cache hits.

## Rollout and regression coverage

- **Merge / deployment order:** PR 1 → PR 8 on `main`, each after green CI.
- **Security:** gitleaks pre-commit; no secrets in fixtures; JSONL events hold no task text.
- **Regression coverage:** unit tests per package, lint fixture tests, e2e in `tests/e2e/`.
- **Open decisions:** none.

## Reviewer verdict

- **Verdict**: approved
- **Reviewer**: general-purpose subagent
- **Date**: 2026-10-16
- **Concerns**:
  - The plan missed the `docs` area and created `requirements.yaml` only in PR 8.
  - A CHANGELOG "generated at release" fails until a release ships.
  - Maps must name files, not commands.
  - A stale snapshot can break `npm run lint` under `--require-prereg`.
  - Turborepo root lint needs explicit inputs and a build dependency; `.turbo/` must be ignored.
  - The stranger e2e still needs registry access for third-party dependencies.
- **Suggested edits** (applied):
  - `requirements.yaml` from PR 1 on; a per-PR check table; the `docs` area mapped; a real `CHANGELOG.md` in PR 1; file-only maps; the `turbo.json` shape; prereg fields on this plan.
- **Second pass** (2026-10-16): approved. Remaining text nits (e2e offline wording, snapshot risk text, PR 8 duplicate, stale evidence count, early status) fixed in this revision.
- **Approval rationale**:
  - The plan covers every area the scorer checks, `requirements.yaml` grows per PR with file-only maps, and the Turborepo and snapshot risks have concrete mitigations.
