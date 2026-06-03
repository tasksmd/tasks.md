# Plan: Bound git-native fold cost at scale

- **Task**: bound-git-native-fold-cost-at-scale
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: validated
- **Validated-by**: reviewer on 2026-06-03

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
- **The simpler 2x-only alternative** — `git log --name-only` (drops the per-commit `diff-tree`) but keep per-event `git show` — is **rejected as the deliverable**: it is still `O(n)` spawns (`~1 + n`), so it does not *bound* cost *at scale*, which is this task's explicit goal. The `cat-file --batch` step is what makes it `O(1)`. The buffer-parsing complexity it adds is contained to one ~10-line helper with a dedicated unit test (step 2), and the entire existing fold suite guards equivalence — an acceptable cost for crossing from linear to constant. If `--batch` parsing proves unexpectedly fragile in implementation, the 2x form is the documented fallback (still a real win) rather than a blocker.

If the read-path change is architecturally notable, add a one-line note to `AGENTS.md`; `gitBuffer`/`catFileBatch` are module-internal helpers (not new public API), and `foldLog`'s contract is unchanged, so no AGENTS.md update is expected — confirm during implementation.

## Implementation steps

1. **Add `gitBuffer(directory, args, input?)`** — `execFileSync("git", args, { cwd, env, input, maxBuffer })` with **no `encoding`** (returns a `Buffer`) and **no `.trim()`**.

2. **Add `catFileBatch(directory, specs: string[]): (Buffer | null)[]`** feeding `specs.join("\n") + "\n"` to `git cat-file --batch`, parsing the `Buffer` with a byte-offset cursor (never decode-then-slice). The two header shapes are distinguished by the **last whitespace token** of the header line (everything up to the first `\n`):
   - success: `<oid> <type> <size>` — read exactly `<size>` bytes after the header `\n` as the content, then skip one trailing `\n`. Push the content `Buffer`.
   - missing/ambiguous: the header ends with ` missing` (e.g. `<spec> missing`) — no content follows; push `null` and advance to after its `\n`.

   ```
   cursor = 0
   while cursor < buf.length:
     nl = buf.indexOf(0x0a, cursor); header = buf.slice(cursor, nl).toString("utf8"); cursor = nl + 1
     if header.endsWith(" missing"): out.push(null); continue
     size = Number(header.slice(header.lastIndexOf(" ") + 1))
     out.push(buf.slice(cursor, cursor + size)); cursor += size + 1   // +1 skips the trailing \n
   ```
   Unit-test `catFileBatch` directly against a seeded repo: (a) a normal ASCII blob, (b) a blob with a multi-byte emoji/`ñ` title, (c) a blob whose JSON contains an embedded `\n`, (d) a `missing` spec → `null`.

3. **Rewrite `readEvents`**: `git log --reverse --format=$'\x1e%H' --name-only <ref> -- events/` (one process). Split on the `\x1e` record-separator: each record's first line is the commit, the rest are its paths (filter `events/`). Build `<commit>:<path>` specs in that order, `catFileBatch` them, `parseEvent` each non-null buffer (`buf.toString("utf8")`), return in order. Remove `eventPathsForCommit`; keep `readEvent` only if another caller uses it (grep — else delete and note in the scout log).

4. **Test + verify.** The full existing git-native suite (fold-equivalence, compaction, claim, heartbeat, no-clobber) must pass unchanged. Add a **scale test**: seed N≈150 tasks via `createGitNativeBackend` (create + a few claims/completes, one title with a multi-byte unicode char), then assert (a) `renderGitNativeSnapshot` lists every still-open task with correct assignee/priority, and (b) a claimed task's `claimId` is intact — i.e. correctness is checked against the **known seeded inputs**, not a retained copy of the old reader. Add a `vi.spyOn(childProcess, "execFileSync")` (implementation kept via `.mockImplementation`-free spy) asserting the git-process count for one `readEvents` call is equal at N=5 and N=150 (the O(1) property).

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

1. `readEvents` no longer loops per-commit over `git show`/`diff-tree`: `grep -c "cat-file" packages/cli/src/backend/git-native.ts` ≥ 1, and `readEvents` contains no per-commit `git show`/`diff-tree` call.
2. A `catFileBatch` unit test passes for: ASCII blob, multi-byte (emoji/`ñ`) blob, blob with an embedded `\n`, and a `missing` spec → `null`.
3. A scale test (N≈150 seeded via `createGitNativeBackend`, incl. a multi-byte-unicode title) asserts `renderGitNativeSnapshot` lists every open task with correct assignee/priority and a claimed task's `claimId` is intact — correctness against the known seeded inputs. `npx vitest run packages/cli/src/backend/git-native.test.ts` passes.
4. A `vi.spyOn(childProcess, "execFileSync")` test asserts the git-process count for one `readEvents` call is **equal** at N=5 and N=150 (the O(1) property).
5. All existing git-native tests pass unchanged (fold-equivalence, compaction, claim, heartbeat, no-clobber).
6. `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

Cycle 1 → needs-revision (5 concerns: parsing detail, O(1)-vs-2x justification, scale-test shape, missing-line parsing, AGENTS.md). Revised, then cycle 2:

- **Verdict**: approved
- **Reviewer**: reviewer
- **Date**: 2026-06-03
- **Concerns**: (empty)
- **Approval rationale**:
  - The byte-offset cursor parsing is explicit and testable, the O(1)-vs-O(n) tradeoff is justified by the task's "bound at scale" goal, and the acceptance criteria are concrete (catFileBatch edge-case unit test, scale test asserting correctness against known seeded inputs, spy test proving constant process count). The existing 13-test git-native suite is the equivalence guardrail, with the 2x form as a documented fallback.
