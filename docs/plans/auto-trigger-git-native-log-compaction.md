# Plan: Auto-trigger git-native log compaction

- **Task**: auto-trigger-git-native-log-compaction
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft
- **Validated-by**: _(filled in after reviewer subagent run)_

## Goal

Stop the `tasks-claims` log growing unbounded. Today `compactGitNativeLog` rewrites the log to its minimal fold-equivalent **locally** but never pushes and is never called automatically, so the remote ref (and every `foldLog`, which is O(events) git subprocess calls on each `list`/`next`/`claim`/`render`) grows forever. Make compaction (a) safely push the rewrite, (b) fire automatically from the single-writer projection past a size threshold, and (c) report the log size so operators can see growth.

## Why

`readEvents` (git-native.ts:388) runs `git rev-list` + a `git diff-tree` + `git show` **per commit**, and `foldLog` runs on every backend op. At thousands of events a single `claim`/`render` becomes tens-to-hundreds of subprocesses → the projection render risks timing out and interactive ops get slow. `compactGitNativeLog` already produces a byte-identical-fold minimal log, but it `update-ref -d`s the **local** ref and never pushes, so it can't shrink the remote and a second writer racing it would clobber state. Nothing triggers it.

## Scope (in)

- **Push-safe compaction.** `compactGitNativeLog` captures the remote tip before rewriting, then pushes the rewrite with `git push --force-with-lease=refs/heads/tasks-claims:<oldRemoteTip> origin`. The lease makes it a CAS: if any claim landed since the read, the push is rejected and compaction aborts cleanly (the local rewrite is discarded on the next fetch; retried next cycle). This is the "single-writer-safe" the task asks for — it can never clobber a concurrent claim.
- **Threshold gate.** `shouldCompact(directory, threshold)` returns true when the event count ≥ threshold (default e.g. 500). Exposed so the projection only compacts when the log is actually large (no force-push churn on every claim).
- **`tasks compact` CLI command** — `tasks compact [--threshold N] [--force]`: compacts + pushes when over threshold (or always with `--force`); prints before/after counts; no-ops (exit 0) under threshold.
- **Projection wiring.** `tasks-snapshot.yml` (+ the `fleet.ts` template) runs `tasks compact --threshold N` after the render step, so the single writer does maintenance. It is best-effort (a failed/aborted compaction never fails the projection).
- **Log-size visibility.** `tasks doctor` reports the current event count (and whether it's over the compaction threshold).
- **Docs.** Note in the threat model that arming a `tasks-claims` force-push ruleset (B6) must exempt the projection/compaction bot, since compaction force-pushes (with lease).

## Scope (out)

- Per-fold caching / batching the `readEvents` subprocesses — that is the separate P2 `bound-git-native-fold-cost-at-scale`. (Compaction reduces N; that task makes folding N cheap. Complementary.)
- Actually configuring the force-push ruleset exemption — operator action, tracked by `arm-hard-claim-enforcement`. The ruleset is not armed today, so compaction's force-push breaks nothing now; we only document the future requirement.
- Changing the checkpoint/snapshot model (no new event types) — keep the existing rewrite-to-minimal approach, just make it push.

## Implementation steps

### Step 1: Push-safe compaction
Add an optional push to `compactGitNativeLog` (capture `oldTip = currentClaimsCommit` after fetch, rewrite, then `--force-with-lease=<ref>:<oldTip>` push; on lease failure, fetch + return a `pushed: false` result). Verify: a new unit test claims, compacts, asserts the remote ref shrank and the open-task fold is unchanged; a second test simulates a racing append between read and push and asserts the push aborts (no clobber).

### Step 2: Threshold + `tasks compact` command
Add `shouldCompact` + the `compact` CLI subcommand. Verify: `tasks compact` under threshold no-ops (before==after, exit 0); over threshold it shrinks. Unit test on `shouldCompact`.

### Step 3: Projection wiring + doctor visibility
Add the `tasks compact --threshold N` step to `tasks-snapshot.yml` + the `fleet.ts` template (after render, best-effort). Add the event-count line to `tasks doctor`. Verify: `npm run build && npm test`; the `fleet.test.ts` claim-check guard still passes; the projection workflow yaml lints.

### Step 4: Docs
Threat-model note on the force-push-ruleset exemption for the compactor. Verify: `npm run lint` + docs-drift clean.

## Risks and mitigations

- **Risk: compaction force-push clobbers a concurrent claim.** A claim lands between the projection's read and its force-push.
  - Mitigation: `--force-with-lease=<ref>:<oldTip>` — the push only succeeds if the remote is still at the tip we compacted from; otherwise it's rejected and we abort. Tested by the racing-append test.
- **Risk: force-push contradicts the B6 "protect tasks-claims from force-push" guidance.** Arming that ruleset would block the compactor.
  - Mitigation: document that the ruleset must exempt the projection/compaction bot; the ruleset isn't armed today, so nothing breaks now; the exemption is part of the `arm-hard-claim-enforcement` operator task.
- **Risk: compaction churn — force-pushing on every projection run.** Excessive pushes/rewrites.
  - Mitigation: threshold gate (only compact when event count ≥ N), so it fires rarely (when the log is genuinely large). The `concurrency` group already serializes projection runs.
- **Risk: losing completed-task history.** Compaction drops terminal-task events.
  - Mitigation: this is the intended "done means gone" model — history remains in the projection's git history and the original PRs; only the live log is minimized.

## Acceptance criteria

1. `compactGitNativeLog` pushes with `--force-with-lease`: `grep -c "force-with-lease" packages/cli/src/backend/git-native.ts` ≥ 1.
2. A unit test asserts compaction shrinks the remote ref AND the open-task fold is byte-identical before/after; another asserts a racing append makes the compaction push abort (no clobber). `npx vitest run packages/cli/src/backend/git-native.test.ts` passes.
3. `tasks compact` exists and is threshold-gated: under threshold it no-ops (exit 0, before==after); a test on `shouldCompact` passes.
4. `tasks-snapshot.yml` and the `fleet.ts` `PROJECTION_WORKFLOW` template both run `tasks compact` (grep), best-effort (does not fail the job).
5. `tasks doctor` prints the event count.
6. `npm run build && npm test && npm run lint` all exit 0; the `fleet.test.ts` claim-check security guard still passes.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->

- **Verdict**: <approved | needs-revision | reject>
- **Reviewer**: <subagent-profile>
- **Date**: <YYYY-MM-DD>
- **Concerns**:
  - <Bulleted list — empty list if approved.>
- **Approval rationale** (only if approved):
  - <2-3 sentences.>
