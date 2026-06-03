# Plan: Make the claim-check workflow actually run on the dogfood repo

- **Task**: make-the-claim-check-workflow-actually-run-on-the-dogfood-re
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft
- **Validated-by**: _(filled in after reviewer subagent run)_

## Goal

Make `tasks-claim-check.yml` actually execute `check-push` against a PR's diff, so that once hard enforcement is armed (`TASKS_CLAIM_ENFORCE=1` + a required ruleset check) it genuinely blocks a code change pushed without a live task claim. Today the check passes vacuously, so arming enforcement would enforce nothing.

## Why

The workflow runs `npx -y @tasks-md/cli check-push ...`. On this repo's CI runner the freshly-published cli fails to install (`sh: 1: tasks: not found` — the same registry-mirror-lag the projection hit, diagnosed in PRs #107–#108). When `npx` fails, the `if npx ...` is false, so control falls into the advisory branch and the step exits 0. The check therefore **always passes**, even for a code change with no claim, and even with `TASKS_CLAIM_ENFORCE=1` it would never exit nonzero. The advisory→hard guarantee (threat model B5) is currently hollow.

The task proposed mirroring the projection's fix — build + run the local cli (`npm ci && npm run build && node packages/cli/dist/cli.js check-push`). **That is a security regression for the claim-check** and must not ship: the claim-check runs `on: pull_request` and `actions/checkout` checks out the PR head, so building the local cli builds the **untrusted PR's** code. A malicious PR could edit `checkWorkPush` to always return ok, build it, and have the claim-check pass its own code-without-claim push — a self-bypass. The projection is safe to build-local because it runs only on trusted triggers (`repository_dispatch`/`workflow_dispatch`/`schedule`), never on untrusted PR code.

The correct fix keeps running the **trusted published cli** (which a PR cannot modify) and only makes its install **reliable** by pinning the public npm registry, bypassing the Intuit Artifactory mirror lag that caused the vacuous pass.

## Scope (in)

- Add `npm_config_registry: https://registry.npmjs.org` to the `env:` of the claim-check's `Path-scoped claim check` step in `.github/workflows/tasks-claim-check.yml`, so `npx -y @tasks-md/cli` resolves the published cli from public npm (where it is present and the `tasks` bin resolves).
- Make the same change in the generated template `CLAIM_CHECK_WORKFLOW` in `packages/cli/src/commands/fleet.ts` (the fix is correct for every consumer repo — the claim-check should always run the trusted published cli, never the PR's build).
- Add a one-line security comment at the npx step explaining why the claim-check must NOT build-local (runs untrusted PR code).
- Keep the existing advisory/`TASKS_CLAIM_ENFORCE` result logic unchanged — only the install reliability changes.

## Scope (out)

- Arming hard enforcement (`TASKS_CLAIM_ENFORCE=1` + required ruleset check + force-push/delete protection) — that is the separate, user-blocked task `arm-hard-claim-enforcement-on-the-dogfood-repo`.
- The projection workflow — already build-local and safe (trusted triggers); not touched.
- Alternative fix "build the cli from the trusted base ref (`origin/main`) instead of the published package" — considered (registry-independent, always in-sync) but rejected for v1 as more complex (dual checkout, careful base-only build) than pinning public npm; recorded here so the reviewer can weigh it.

## Implementation steps

### Step 1: Pin public npm in the live claim-check workflow

Add `npm_config_registry: https://registry.npmjs.org` to the step's `env:` (alongside `ENFORCE`), and a security comment above the `npx` line. Verify: `grep -c "npm_config_registry" .github/workflows/tasks-claim-check.yml` returns ≥1 and `grep -c "node packages/cli" .github/workflows/tasks-claim-check.yml` returns 0.

### Step 2: Mirror the change in the fleet.ts template

Update `CLAIM_CHECK_WORKFLOW` in `packages/cli/src/commands/fleet.ts` identically. Verify: `npm run build -w packages/cli` succeeds and `node -e` rendering the template shows the registry pin.

### Step 3: Verify nothing else broke

`npm run build`, `npm test`, `npm run lint` all pass. The generated workflow remains `on: pull_request` (not `pull_request_target`).

## Risks and mitigations

- **Risk: public npm unreachable from the CI runner.** The pin would make `npx` fail and the check stay advisory-passing.
  - Mitigation: `publish.yml` already reaches public npm (it publishes there), so the runner can reach it; and a failed npx degrades to the current advisory behavior — no regression.
- **Risk: the published cli lags `main`'s `check-push` semantics.** A PR that depends on unreleased check-push behavior would be checked by older logic.
  - Mitigation: `check-push` is a stable Phase-3 primitive; the claim-check only needs path + trailer logic, which has not changed. Acceptable; the build-from-base alternative (Scope out) is the escape hatch if it ever drifts.
- **Risk: a future maintainer "simplifies" the claim-check to build-local to match the projection.** That reintroduces the self-bypass.
  - Mitigation: the inline security comment plus a threat-model note explain the divergence; conformance/CI does not (yet) guard it — recorded as a scout task below.

## Acceptance criteria

1. `grep -c "npm_config_registry: https://registry.npmjs.org" .github/workflows/tasks-claim-check.yml` returns ≥1.
2. `grep -c "npx -y @tasks-md/cli check-push" .github/workflows/tasks-claim-check.yml` returns ≥1 (still the trusted published cli).
3. `grep -c "node packages/cli/dist/cli.js" .github/workflows/tasks-claim-check.yml` returns 0 (NOT build-local — the security property holds).
4. The `fleet.ts` `CLAIM_CHECK_WORKFLOW` template carries the same registry pin: `node -e "process.stdout.write(require('./packages/cli/dist/commands/fleet.js').CLAIM_CHECK_WORKFLOW||'')"` or a source grep returns the pin.
5. `npm run build && npm test && npm run lint` all exit 0.
6. The workflow still triggers `on: pull_request` (not `pull_request_target`): `grep -c pull_request_target .github/workflows/tasks-claim-check.yml` returns 0.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->

- **Verdict**: <approved | needs-revision | reject>
- **Reviewer**: <subagent-profile>
- **Date**: <YYYY-MM-DD>
- **Concerns**:
  - <Bulleted list — empty list if approved.>
- **Suggested edits** (only if needs-revision):
  - <Specific changes to make.>
- **Approval rationale** (only if approved):
  - <2-3 sentences confirming why the plan is ready for implementation.>
