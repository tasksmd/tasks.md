# Plan: Bound git-native fold cost at scale

- **Task**: bound-git-native-fold-cost-at-scale
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft
- **Validated-by**: _(filled in after reviewer subagent run)_

## Goal

Make `readEvents` (the input to every `foldLog`) spawn a **constant** number of git child processes instead of `~1 + 2n` for `n` events, while preserving the exact event order and parse behavior. `foldLog` runs on every `list`/`next`/`claim`/`render`/`check-push`, so this is the per-operation latency floor.

## Why

`readEvents` (git-native.ts:413) runs `git rev-list --reverse` (1 process) and then, **per commit**, `eventPathsForCommit` (a `git diff-tree`) + a `git show` per event blob — `~1 + 2n` process spawns. Compaction caps `n` at `COMPACTION_SUGGESTED_AT` (5000), but a single fold near that cap still spawns ~10 000 processes, so `claim`/`render` get very slow right before each compaction and on any large pre-compaction log. Process-spawn count, not parsing, is the cost.

## Scope (in)

- Rewrite `readEvents` to two git invocations, order-preserving:
  1. `git log --reverse --format=<unit-sep>%H --name-only <ref> -- events/` (one process) → an ordered list of `(commit, [eventPaths])`, exactly mirroring `rev-list --reverse` + `eventPathsForCommit` (git log handles the root commit's added files like `diff-tree --root`).
  2. `git cat-file --batch` (one process) fed every `<commit>:<path>` spec in that order → parse the size-framed output **as a Buffer** (byte-exact, so multi-byte UTF-8 task titles/bodies don't drift), `parseEvent` each blob, collect in order.
- Add a `gitBuffer(directory, args, input)` helper (`execFileSync` with no `encoding` → `Buffer`, no `.trim()`) for the batch read; keep the existing `git`/`tryGit` untouched.
- Preserve the EXACT current contract: same events, same order (`rev-list --reverse` == `git log --reverse`), same `parseEvent` filtering (bad/missing blobs skipped). `foldLog` and every caller are unchanged.

## Scope (out)

- Per-process fold memoization (caching `foldLog` by ref tip) — a separate, complementary win; file as follow-up.
- Changing the event schema, `eventPath`, or compaction.
- Any behavior change to ordering or which events count — this is a pure read-path perf refactor.

## Implementation steps

1. Add `gitBuffer` + a `catFileBatch(directory, specs: string[]): (Buffer|null)[]` that writes specs to `git cat-file --batch` and parses the framed output: per object read the header line `<oid> <type> <size>\n` (or `<spec> missing\n` → null), then exactly `size` bytes, then the trailing `\n`. Verify with a unit test feeding known blobs.
2. Rewrite `readEvents`: parse the `git log --name-only` output into ordered `(commit, paths)`, build `<commit>:<path>` specs (events/ only), `catFileBatch` them, `parseEvent` each non-null buffer as utf-8, return in order. Keep `readEvent`/`eventPathsForCommit` only if still used elsewhere (else remove — scout).
3. Run the full git-native suite (fold, compaction, claim, heartbeat, no-clobber) unchanged → must pass. Add a scale test (N≈150 events incl. one with a multi-byte unicode title) asserting the folded snapshot equals a per-event reference, and a `vi.spyOn(child_process, "execFileSync")` (impl kept) asserting `readEvents` spawns a constant number of git processes for N=5 and N=150 (proves O(1)).

## Risks and mitigations

- **Risk: `cat-file --batch` frame mis-parse** (size in bytes vs JS string chars; embedded newlines in a blob).
  - Mitigation: parse the Buffer by byte offset (never decode-then-slice); decode each content slice as utf-8 only after framing. The unicode-title test exercises multi-byte framing.
- **Risk: order drift** if `git log --reverse` differs from `rev-list --reverse`.
  - Mitigation: both are reverse-topological/commit order on a linear chain (the claims log is a single parent chain); the scale test compares the new fold to the old per-event reference for the SAME repo.
- **Risk: behavior regression in the fold** (the fold drives all reads + `check-push`).
  - Mitigation: the entire existing 13-test git-native suite is the safety net and must pass unchanged; no caller signature changes.
- **Risk: `missing`/malformed blob handling regresses.**
  - Mitigation: `catFileBatch` returns null for `missing`; `parseEvent` already returns undefined for bad JSON — both skipped, matching today.

## Acceptance criteria

1. `readEvents` no longer loops per-commit over `git show`/`diff-tree`: `grep -c "cat-file" packages/cli/src/backend/git-native.ts` ≥ 1, and `readEvents` contains no per-commit `git show` call.
2. A scale test (N≈150, incl. a unicode-title event) asserts the new fold's rendered snapshot equals the reference; `npx vitest run packages/cli/src/backend/git-native.test.ts` passes.
3. A spy test asserts `readEvents` git-process count is constant across N=5 vs N=150 (O(1), the perf property).
4. All existing git-native tests pass unchanged (fold-equivalence, compaction, claim, heartbeat, no-clobber).
5. `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->

- **Verdict**: <approved | needs-revision | reject>
- **Reviewer**: <subagent-profile>
- **Date**: <YYYY-MM-DD>
- **Concerns**:
  - <Bulleted list — empty list if approved.>
- **Approval rationale** (only if approved):
  - <2-3 sentences.>
