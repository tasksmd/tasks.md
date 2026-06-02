# Plan: git-native deterministic fleet claiming

- **Task**: `deterministic-fleet-claiming`
- **Repo**: `~/apps/tooling/tasks.md`
- **Author**: devin (claude-opus-4.x) session 2026-06-02
- **Status**: validated
- **Validated-by**: `reviewer` subagent on 2026-06-02 (first pass: needs-revision; second pass: approved after resolving the six concerns)

## Goal

Let a team of machines — each running a parallel fleet of agents — pull from one
`TASKS.md` queue with **zero duplicate work** and **deterministic selection**, using
only git as the transport (no server). A claim becomes a git compare-and-swap (CAS)
over per-task files on a dedicated, CI-excluded ref. `TASKS.md` stays the
human/agent-readable queue (VISION G3); coordination is delegated to the git-native
mechanism rather than built as a bespoke scheduler (G6/G7).

## Why

Today `(@agent-id)` claiming is best-effort (spec.md § Claiming "Limitations"): claims
are visible only after a push, and `pickBestTask` is deterministic, so two agents on an
identical file pick the *same* top task — determinism turns "can collide" into "will
collide." `tasks claim` is also a no-op (`packages/cli/src/backend/tasks-md.ts:84`), so
the file backend has **no machine-safe claim primitive at all**. The operator decision
(TASKS.md `deterministic-fleet-claiming`, Research (f)) is to stay git-native because
agents are file-native. Prior art proves the mechanism: `zedutch/tq` (per-task markdown
files + git, machine identity) and `Nautilus git-queue` (optimistic-lock mutual
exclusion via git commits). This plan turns that decision into a thin, correct v1.

The correctness insight that keeps v1 small: **git push IS the CAS, and it is the
arbiter at both tiers.** Two agents on the same host or different hosts both call
`tasks claim` → the push serializes them identically. So v1 needs none of the two-tier
machinery (HRW partition, per-host daemon, file-lock) — those are throughput
optimizations deferred to follow-ups.

## Scope (in)

- `spec.md`: a new `## Fleet coordination` section defining the git-native model —
  per-task claim files on a dedicated ref, the git-CAS claim loop, the lease field, the
  deterministic same-task resolver, and the `@machine/agent` identity convention.
- `packages/cli/src/backend/config.ts` + `index.ts`: add a `git-claims` `BackendKind`
  and wire `createBackend`.
- `packages/cli/src/backend/git-claims.ts` (new): implements `TaskBackend` —
  `listOpen`/`next` consult the claim ledger; `claim` does the git-CAS; `complete`
  removes the `TASKS.md` block and deletes the claim file.
- A claim-store module: parse/serialize a claim file (frontmatter `owner`, `claimed_at`,
  `lease_expires`, `token`) + `isClaimLive(claim, now)`.
- A git-CAS module: write claim → commit on the claims ref (via a pinned worktree) →
  push → on non-ff rejection fetch + rebase + deterministic resolve → retry or yield.
- `.tasksmd.json` schema: document the git-claims fields — `backend: "git-claims"`,
  `claimsRef` (default `tasks-claims`), `leaseTtlSec` (default 120) — in `spec.md` and
  `config.ts`.
- A sample CI workflow snippet (under `docs/` or `examples/`) that **excludes the claims
  ref / `.tasks/claims/**`** from the build pipeline, with prose on why.
- Tests, including the two-clone collision matrix (see Acceptance).

## Scope (out)

- **Per-host coordinator daemon** (poll loop, batch pusher, local file-lock to subdivide
  among a host's agents). Throughput optimization only. → follow-up
  `fleet-claim-coordinator-daemon`.
- **Heartbeat-based liveness** (re-pushed claim files). v1 uses a long lease + optional
  work-branch-activity liveness (no per-beat commits — see Risks). → follow-up
  `fleet-claim-heartbeat-liveness`.
- **HRW machine-partition** to cut contention; **ref-sharding** (`tasks-claims-<k>`) to
  parallelize push throughput; **fencing tokens**; a **stale-claim reaper**. → follow-ups
  `fleet-claim-hrw-partition`, `fleet-claim-ref-sharding`.
- **Server-queue backend** (pgmq/River). Out of scope by the operator decision; only
  revisited if the scale trip-wire (Risks) fires. → follow-up `fleet-claim-queue-backend`.
- **MCP tool wiring** for the new backend beyond what already routes through `getBackend`.
  → follow-up `fleet-claim-mcp-surface`.

## Implementation steps

### Step 1: Spec the model first

Add `spec.md` `## Fleet coordination`: claims as per-task files under `.tasks/claims/<id>`
on a dedicated ref (default a `tasks-claims` branch; `refs/tasks/*` where the host
allows); the claim = git-CAS loop; the claim-file fields; the deterministic same-task
resolver (earliest `claimed_at`, tie → lexicographic `machine/agent`); the
`@machine/agent` identity convention; and that the claims ref is CI- and
branch-protection-excluded. Verify: `npx -y @tasks-md/lint TASKS.md` exits 0;
`grep -c "Fleet coordination" spec.md` ≥ 1.

### Step 2: Backend selection plumbing

Add `git-claims` to `BackendKind` (`config.ts`), `isBackendKind`, the unknown-backend
error message, and the `createBackend` switch (`index.ts`). Verify:
`npm run build -w packages/cli`; a `config.test.ts` case asserts `git-claims` resolves
and an unknown value throws.

### Step 3: Claim store, liveness, and the winner resolver (pure, no git)

New module, pure functions (no I/O):
- parse/serialize a claim file (frontmatter: `owner` = `@machine/agent`, `claimed_at`,
  `lease_expires`, `token`, and a `v` schema-version int for forward-compat).
- `isClaimLive(claim, now)` — true iff `now < lease_expires`. Clock source is the
  caller's `Date.now()` (system wall-clock); v1 relies on NTP + a generous lease TTL
  rather than skew tolerance (see Risks § clock skew).
- `selectWinner(claims)` — the deterministic same-task resolver: the claim with the
  earliest `claimed_at` wins; ties broken by the lexicographically smallest `owner`.
  Both sides of a merge compute the same winner, so it never produces a human conflict.
  This is the single definition of the resolver; Step 4 (git merge driver) calls it.

Verify: unit tests for round-trip serialize/parse; `isClaimLive` boundaries
(`now <`/`==`/`>` `lease_expires` → live / not / not); and `selectWinner` determinism
(same input set in any order → same winner).

### Step 4: Git-CAS claim (the core, highest-risk)

`claimViaGitCas(taskId, identity)`: operate the claims ref through a detached
`git worktree` under a gitignored path; write `.tasks/claims/<id>`; commit; `git push`.
On non-ff rejection: `git fetch`; if `<id>` now has a live claim → return `{won:false}`;
else rebase the local commit (different files merge clean) and re-push. Retries use
**exponential backoff** (100ms initial, 5s cap, 10 retries max); on exhaustion return
`{won:false}` with `claim rejected: too many rebase conflicts`. A same-task add/add is
resolved by a custom git merge driver that calls `selectWinner` (Step 3) — never a human
conflict; the loser's claim file is dropped and the caller re-reads to confirm. Verify:
the two-clone integration test (Acceptance #3/#4).

### Step 5: Wire the `TaskBackend` surface

`git-claims.ts`: `listOpen`/`next` delegate ranking to the parser's `pickBestTask` but
filter out tasks with a *live* claim (read the claims ref); `claim` calls
`claimViaGitCas`; `complete` deletes the claim file (claims ref) and removes the
`TASKS.md` block (parser's existing removal). Verify: end-to-end test in a temp repo —
claim → next skips it → complete → next returns it gone.

### Step 6: CI exclusion + docs

Add an `examples/`/docs sample workflow snippet that excludes the claims ref / path; note
the `.tasksmd.json` `{ "backend": "git-claims", "claimsRef": "tasks-claims",
"leaseTtlSec": 120 }` shape in spec/README. Verify: a test asserts the example workflow
does not trigger on the claims ref; `npm run build:site` if site output changes.

## Risks and mitigations

- **Risk: merge-loop bug yields two winners or a stuck loop.** Distributed locking via
  git is easy to get subtly wrong (git-queue had bugs; Bors #875 double-started a batch).
  - Mitigation: keep the loop minimal; a single deterministic resolver; the two-clone
    collision test (Acceptance #3) plus a randomized-interleaving property test; bounded
    retries that surface a clear error rather than spin.
- **Risk: heartbeat commits bloat the repo.** Re-pushing a claim file every ~30s ≈ tens
  of thousands of commits/day on the claims ref, in the same `.git`.
  - Mitigation: v1 ships **no heartbeat commits** — long lease + liveness inferred from
    the agent's work branch advancing; heartbeat (with periodic claims-ref compaction) is
    deferred to `fleet-claim-heartbeat-liveness`.
- **Risk: push throughput / rate-limit ceiling.** Every claim is a serialized push;
  realistic ceiling is low-tens/sec/ref vs thousands for a DB queue.
  - Mitigation: the workload is minute-plus coding tasks at low claim rates, where this
    never binds; per-host batching is deferred to the coordinator; **trip-wire**: if
    sustained claims exceed ~tens/min or the fleet exceeds ~tens of hosts, switch to the
    `fleet-claim-queue-backend`. Documented in spec § Fleet coordination.
- **Risk: custom-ref / branch-protection friction.** `refs/tasks/*` isn't accepted by
  all hosts; "PRs for everything" policies fight a frequently-pushed claims branch.
  - Mitigation: default to a plain `tasks-claims` branch (portable) with a documented
    CI + branch-protection carve-out; `refs/tasks/*` is opt-in where supported.
- **Risk: clock skew breaks lease expiry and the earliest-`claimed_at` tiebreak.** The
  tiebreak is safe (both sides run the same `selectWinner` on the same files), but
  `isClaimLive` compares a remote `lease_expires` to local `Date.now()`, so a fast/slow
  clock causes premature or delayed steals.
  - Mitigation: require NTP; set `leaseTtlSec` ≥ 2× expected max skew; on a detected
    backward clock jump, refuse to steal that cycle. If skew can't be bounded, the scale
    trip-wire applies → `fleet-claim-queue-backend`. A fencing token / commit topology
    replaces wall-clock when `fleet-claim-hrw-partition` lands.
- **Risk: wasted *work* (not duplicate claim) in the consistency window.** A stale read
  can start an agent thinking about a task it will lose.
  - Mitigation: claim-confirmed-**before**-work; push immediately; short (≤1 min) poll
    bounds the window. The CAS still guarantees no duplicate *completion*.
- **Risk: TASKS.md and the claims ledger drift** (claim for a removed task, etc.).
  - Mitigation: `next()` reconciles — a claim whose task is gone from `TASKS.md` is
    ignored; a task whose claim lease expired is claimable.
- **Risk: orphaned claim files accumulate.** A claim file for a task already removed from
  `TASKS.md` is ignored by `next()` but persists on the claims ref.
  - Mitigation: v1 ships no reaper — `next()` ignores dead claims and an operator can
    `git rm` them; a stale-claim reaper is deferred to `fleet-claim-ref-sharding`. The
    dedicated, CI-excluded claims ref bounds the blast radius (no `main`-history bloat).
- **Risk: claim-file format must evolve.** Adding/renaming a field could break older
  agents mid-fleet.
  - Mitigation: the `v` schema-version field (Step 3); readers tolerate unknown fields
    and treat an unreadable/newer-`v` claim as opaque-but-live (never silently steal it).

## Acceptance criteria

1. Spec documents the model: `grep -c "Fleet coordination" spec.md` ≥ 1; the spec also
   documents the `.tasksmd.json` git-claims fields (`grep -c "leaseTtlSec" spec.md` ≥ 1);
   and `npx -y @tasks-md/lint TASKS.md` exits 0.
2. `git-claims` backend is selectable: a `config.test.ts` case proves
   `.tasksmd.json {"backend":"git-claims"}` resolves and an unknown backend throws;
   `npm test -w packages/cli` exits 0.
3. **Collision (the core gate):** a test with two clones of one bare repo has both
   `claim("X")` concurrently; exactly one `.tasks/claims/X` persists, the loser's `claim`
   returns `{won:false}` / "taken". Test exits 0.
4. **Different-task claims auto-merge:** two clones `claim("X")` and `claim("Y")`; both
   return `{won:true}`; the claims ref contains both files with no manual conflict.
5. **Lease reclaim:** a claim past `lease_expires` is treated as claimable (`isClaimLive`
   false); unit + integration test.
6. `next()`/`listOpen()` skip live-claimed tasks and surface expired-claim tasks
   (backend test).
7. `complete(id)` removes the `TASKS.md` block **and** deletes `.tasks/claims/<id>`
   (end-to-end test).
8. CI exclusion: (a) an example CI workflow under `docs/`/`examples/` excludes the
   claims ref / `.tasks/claims/**`; (b) a test asserts that workflow does not trigger on
   the claims ref; (c) the spec explains why the claims ref is CI- and
   branch-protection-excluded.
9. Determinism preserved: existing `pickBestTask` tests pass unchanged
   (`npm test -w packages/parser` exits 0).
10. Full gate green: `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

- **Verdict**: approved (second pass; first pass: needs-revision, six concerns resolved)
- **Reviewer**: `reviewer` subagent (plan-validation profile)
- **Date**: 2026-06-02
- **Concerns**:
  - (none remaining — the six first-pass concerns were resolved: deterministic resolver defined in Step 3, git merge driver wired in Step 4, drift + orphaned-file handling documented with honest v1 limits, acceptance criteria cover all Scope (in) items with runnable checks, config.ts plumbing explicit, exponential backoff specified, clock-skew mitigation made concrete + a claim-format-evolution risk added.)
- **Approval rationale**:
  - The core insight — git push as the CAS, per-task claim files, a deterministic `selectWinner` resolver — is sound, and the two-clone collision test (#3/#4) is the right correctness gate. Scope is appropriately tight for v1, with throughput work (coordinator daemon, HRW partition, ref-sharding, reaper) and a server-queue fallback honestly deferred to named follow-ups. Every acceptance criterion has a runnable check, so the plan is ready for implementation.
