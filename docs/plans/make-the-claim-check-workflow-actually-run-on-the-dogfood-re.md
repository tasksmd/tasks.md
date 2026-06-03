# Plan: Make the claim-check workflow actually run on the dogfood repo

- **Task**: make-the-claim-check-workflow-actually-run-on-the-dogfood-re
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: validated
- **Validated-by**: reviewer on 2026-06-03

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
- **Regression guard (per reviewer concern 1, and the repo's feedback-loop rule — a security invariant must be a mechanical check, not a comment):** add a test that reads both the live `tasks-claim-check.yml` and the `CLAIM_CHECK_WORKFLOW` template and asserts each (a) does NOT contain `node packages/cli/dist/cli.js check-push` (never build-local), (b) DOES contain `npx -y @tasks-md/cli check-push` (trusted published cli), (c) carries the public-npm registry pin. The test fails if a future change reintroduces build-local. Home: `packages/cli/src/commands/fleet.test.ts` (the template's natural test) reading the live workflow via a repo-root-relative path.
- **Threat-model documentation (per reviewer concern 2):** add a "Deliberate divergences" subsection to `docs/security/git-native-claims-threat-model.md` § CI workflow guidance, recording WHY the projection builds-local (trusted triggers only) while the claim-check runs the published cli (untrusted PR head) — so the divergence reads as an intentional security choice, not an inconsistency to "fix".

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
  - Mitigation: the new regression-guard test (Scope in) fails CI if the claim-check workflow or template gains `node packages/cli/dist/cli.js check-push`; the inline comment + threat-model "Deliberate divergences" subsection explain why.

## Acceptance criteria

1. `grep -c "npm_config_registry: https://registry.npmjs.org" .github/workflows/tasks-claim-check.yml` returns ≥1.
2. `grep -c "npx -y @tasks-md/cli check-push" .github/workflows/tasks-claim-check.yml` returns ≥1 (still the trusted published cli).
3. **Security property — never build-local:** `grep -c "node packages/cli/dist/cli.js" .github/workflows/tasks-claim-check.yml` returns 0, AND the same holds for the `CLAIM_CHECK_WORKFLOW` template in `packages/cli/src/commands/fleet.ts`.
4. The `fleet.ts` `CLAIM_CHECK_WORKFLOW` template carries the same registry pin (source grep returns the pin).
5. `npm run build && npm test && npm run lint` all exit 0.
6. The workflow still triggers `on: pull_request`, never the dangerous `pull_request_target`: `grep -c pull_request_target .github/workflows/tasks-claim-check.yml` returns 0. (Necessary for fork safety; the build-local property is covered separately by criterion 3.)
7. **Regression guard exists:** a test in `packages/cli/src/commands/fleet.test.ts` asserts criteria 2+3+4 against both the live workflow and the template, and would fail if a future PR adds build-local to the claim-check. Prove by inverting the assertion locally (temporarily) and seeing the test go red, then revert.

## Reviewer verdict

Cycle 1 returned needs-revision (3 concerns: no regression guard, missing threat-model divergence note, indirect criterion 6). Revised, then cycle 2:

- **Verdict**: approved
- **Reviewer**: reviewer
- **Date**: 2026-06-03
- **Concerns**: []
- **Approval rationale**:
  - The revised plan fully addresses all three concerns with concrete, mechanical safeguards: a regression-guard test that enforces the build-local prohibition at CI time (criterion 7), explicit threat-model documentation of the deliberate projection vs. claim-check divergence, and clarified acceptance criteria that distinguish trigger safety from build-strategy safety. The plan is implementable with deterministic verification and durable security properties.
