# Plan: Auto-trigger git-native log compaction

- **Task**: auto-trigger-git-native-log-compaction
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: validated
- **Validated-by**: reviewer on 2026-06-03

## Goal

Stop the `tasks-claims` log growing unbounded. Today `compactGitNativeLog` rewrites the log to its minimal fold-equivalent **locally** but never pushes and is never called automatically, so the remote ref (and every `foldLog`, which is O(events) git subprocess calls on each `list`/`next`/`claim`/`render`) grows forever. Make compaction (a) safely push the rewrite, (b) fire automatically from the single-writer projection past a size threshold, and (c) report the log size so operators can see growth.

## Why

`readEvents` (git-native.ts:388) runs `git rev-list` + a `git diff-tree` + `git show` **per commit**, and `foldLog` runs on every backend op. At thousands of events a single `claim`/`render` becomes tens-to-hundreds of subprocesses → the projection render risks timing out and interactive ops get slow. `compactGitNativeLog` already produces a byte-identical-fold minimal log, but it `update-ref -d`s the **local** ref and never pushes, so it can't shrink the remote and a second writer racing it would clobber state. Nothing triggers it.

## Scope (in)

- **Push-safe compaction.** `compactGitNativeLog` captures the remote tip right after `fetchClaimsRef` (call it `oldTip`), rewrites locally, then pushes with `git push --force-with-lease=refs/heads/tasks-claims:<oldTip> origin`. **Claims arrive from agents on any machine at any time** — the projection is the single writer of the *snapshot/compaction*, not of claims — so the lease is the guard: it pushes only if the remote is still at `oldTip`; if any claim landed in the fetch→push window the remote has advanced, the push is rejected, and compaction aborts (the local rewrite is discarded on the next fetch and retried next cycle). It can therefore never clobber a claim. `claim_id` (the fencing token, line 1076) and `lease_expires_at` (line 1077) are carried into the minimal `claimed` event, so `check-push`/`complete --claim` fencing — which keys on `claim_id`, not `event_id` — keeps working across a compaction.
- **Threshold gate.** `shouldCompact(directory, threshold)` returns true when the event count ≥ threshold. Reuse the existing `COMPACTION_SUGGESTED_AT = 5000` constant in `fleet.ts` (don't invent a second number) so the auto-trigger and the existing `fleet stats` suggestion agree. The projection only compacts past this, so there is no force-push churn on ordinary claims.
- **`tasks compact` CLI command** — `tasks compact [--threshold N] [--force]`: compacts + pushes when over threshold (or always with `--force`); prints before/after counts; no-ops (exit 0) under threshold.
- **Projection wiring.** `tasks-snapshot.yml` (+ the `fleet.ts` template) runs `node packages/cli/dist/cli.js compact` (live repo) / `npx ... compact` (template) after the render step, suffixed with `|| true` so an aborted/lease-rejected compaction never fails the projection job (the next cycle retries).
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
- **Risk: force-push contradicts the B6 "protect tasks-claims from force-push" guidance.** Arming that ruleset would silently block the compactor (compaction would always lease-fail → log never shrinks).
  - Mitigation: the threat-model note states that a `tasks-claims` force-push ruleset MUST exempt the projection/compaction bot — on github.com via the ruleset's `bypass_actors` (the bot's app/team), on GHE via a `pre-receive` exception for that ref+actor. The ruleset isn't armed today, so nothing breaks now; the exemption is called out as a required sub-step of the `arm-hard-claim-enforcement` operator task so a future operator doesn't arm it and break compaction unaware.
- **Risk: a slow/stale compaction pushes an out-of-date rewrite.** The projection fetches, then pauses, then pushes much later from a stale local view.
  - Mitigation: same `--force-with-lease=<ref>:<oldTip>` — the lease is the tip captured at fetch time, so a stale push is rejected exactly like a raced claim. Considered the append-only **checkpoint** alternative (write a checkpoint event the fold reads from, never rewrite/force-push); rejected for v1 because it bounds fold cost but not clone/ref size and adds a new event type + fold-from-checkpoint logic — more surface than the proven rewrite + a lease-guarded push.
- **Risk: compaction churn — force-pushing on every projection run.** Excessive pushes/rewrites.
  - Mitigation: threshold gate (only compact when event count ≥ N), so it fires rarely (when the log is genuinely large). The `concurrency` group already serializes projection runs.
- **Risk: losing completed-task history.** Compaction drops terminal-task events.
  - Mitigation: this is the intended "done means gone" model — history remains in the projection's git history and the original PRs; only the live log is minimized.

## Acceptance criteria

1. `compactGitNativeLog` pushes with `--force-with-lease`: `grep -c "force-with-lease" packages/cli/src/backend/git-native.ts` ≥ 1.
2. A unit test asserts compaction shrinks the remote ref (push happened) AND the open-task fold is byte-identical before/after (incl. preserved `claim_id` + `lease_expires_at`). A second test pins the no-clobber race: claim a task to a bare-remote, fetch+compact, then append a *new* claim directly to the remote (advancing its tip), then attempt the compaction push — assert it is rejected (`pushed: false`) and the new claim survives on the remote. `npx vitest run packages/cli/src/backend/git-native.test.ts` passes.
3. `tasks compact` exists and is threshold-gated: under `COMPACTION_SUGGESTED_AT` it no-ops (exit 0, before==after); a `shouldCompact` unit test passes.
4. Both `.github/workflows/tasks-snapshot.yml` and the `fleet.ts` `PROJECTION_WORKFLOW` template invoke compaction with a trailing `|| true`: `grep -c "compact" .github/workflows/tasks-snapshot.yml` ≥ 1 and the same for the rendered template (via `runFleetInit` in a test or a source grep).
5. `tasks doctor` prints the event count.
6. `npm run build && npm test && npm run lint` all exit 0; the `fleet.test.ts` claim-check security guard still passes.

## Reviewer verdict

Cycle 1 → needs-revision (8 yellow refinements: lease-window framing, B6 bypass_actors, racing-test specificity, threshold reuse, claim_id preservation, best-effort wiring, wired-grep, checkpoint alternative). Revised, then cycle 2:

- **Verdict**: approved
- **Reviewer**: reviewer
- **Date**: 2026-06-03
- **Concerns**: (empty)
- **Approval rationale**:
  - The plan correctly frames the lease as guarding the fetch→push window against concurrent claims, explicitly preserves the fencing keys (`claim_id` + `lease_expires_at`) across compaction, and provides concrete, testable acceptance criteria. The B6 ruleset exemption is documented as a required sub-step of the operator task, and the checkpoint-vs-rewrite trade-off is justified.
