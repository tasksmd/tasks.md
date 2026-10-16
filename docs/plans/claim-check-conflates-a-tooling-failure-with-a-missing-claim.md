# Plan: Tell a claim-check tooling failure apart from a missing claim

- **Task**: claim-check-conflates-a-tooling-failure-with-a-missing-claim
- **Repo**: ~/apps/tooling/tasks.md
- **Author**: claude session 2026-10-16
- **Status**: validated

## Overall goal and vision

A PR author who sees the claim-check fail must know why. Today the workflow
runs `check-push` inside one `if`. A tooling failure (the cli did not install,
the pinned cli has no `check-push`, or it crashed) and a real claim rejection
both reach the same branch. With `TASKS_CLAIM_ENFORCE=1` both print
`code change without a live task claim`. That message was seen live for a
stale `CLI_VERSION` pin, and it sent the author to fix the wrong thing.

## Decision and alternatives

- **Chosen:** keep the logic inline in the workflow. Add a pre-check that the
  cli exists and its root `--help` lists `check-push`. Capture `check-push` output and
  exit code. Only a nonzero exit with a line that starts with `rejected:` is a
  claim violation. Anything else is a tooling failure with its own message:
  `claim-check could not run (cli/tooling problem): <reason>`.
- **Tooling failure policy:** fail closed when enforcing (a required gate that
  cannot run must not pass), warn when advisory.
- **Rejected:** move the logic into a repo script. The job runs on the
  untrusted PR head, so a PR could edit that script and pass its own gate.
- **Rejected:** a new `check-push` exit code. The gate runs the *published*
  pinned cli, so a new code only helps after a release. The `rejected:` stderr
  line exists in every published version that has `check-push`.

## Evidence and current state

| Claim | Source | Status |
| --- | --- | --- |
| `check-push` reject prints `rejected:` on stderr and exits 1 | `packages/cli/src/cli.ts` check-push action | fact |
| `<unknown-cmd> --help` exits 0 in commander, so it cannot detect a missing command | reviewer test on 2026-10-16 | fact |
| The unquoted `$paths` let a file named `--help` reach check-push as a flag | reviewer finding; `--` fixes it | fact |
| The `fleet init` template has the same conflation | `CLAIM_CHECK_WORKFLOW` in `packages/cli/src/commands/fleet.ts` | fact |
| GitHub runs `run:` blocks as `bash -eo pipefail` | GitHub Actions default shell | fact |

## Scope (in)

- `.github/workflows/tasks-claim-check.yml` and the `fleet init` template.
- A test that runs both workflow scripts against a fake cli in five modes.
- `docs/release-and-ci.md` note.

## Scope (out)

- Bumping `CLI_VERSION` (task land-0-10-3-version-bump-and-claim-check-cli-pin,
  blocked on the 0.11.0 npm publish).

## Numbered work breakdown

### 1. Red test

- **Why:** prove the conflation.
- **Change:** `packages/cli/src/claim-check-workflow.test.ts` extracts the
  step's `run:` block and runs it in a fixture repo with fake `npm`/`npx`.
- **Verification:** `npx vitest run packages/cli/src/claim-check-workflow.test.ts`
  fails on `missing`, `nocmd`, `crash` before the fix.

### 2. Fix both workflows

- **Change:** pre-check, captured exit code, `rejected:` sentinel,
  `tooling_failure` helper.
- **Verification:** the same test passes (14 cases).

## Risks and mitigations

- **Risk: `set -e` kills the script on a failed command substitution.**
  - Mitigation: `out=$(...) || rc=$?`; the test runs under `bash -eo pipefail`.
- **Risk: a future cli changes the reject wording.**
  - Mitigation: the test pins the sentinel; a wording change fails closed with
    the tooling message, which names the real problem.
- **Risk: fail-closed on a registry outage blocks PRs.**
  - Mitigation: the message says it is a tooling problem, so a re-run is the
    obvious fix; passing an unchecked PR through a required gate is worse.

## Acceptance criteria

1. A tooling failure prints `claim-check could not run (cli/tooling problem)`
   and never the claim message.
2. A real reject still prints the claim message and exits 1 when enforcing.
3. `npm run build && npm test && npm run lint` pass.

## Reviewer verdict

Cycle 1: changes requested. (1) `check-push --help` exits 0 for an unknown
command, so the pre-check now reads the root help. (2) Paths now follow `--`,
so a file named `--help` cannot make check-push print help and exit 0.
(3) The sentinel grep uses a here-string, so `grep -q` cannot SIGPIPE under
`pipefail`. The fake cli now mimics commander and requires `--`.

- **Verdict**: approved
- **Reviewer**: reviewer subagent
- **Date**: 2026-10-16
