# Plan: collision-free fleet claiming — spec + conformance + thin reference adapter

> (Task id stays `deterministic-fleet-claiming` for continuity; the *guarantee* is
> **collision-freedom**, so the human-facing name is now "collision-free fleet claiming"
> — see issue-resolution §.)

- **Task**: `deterministic-fleet-claiming`
- **Repo**: `~/apps/tooling/tasks.md`
- **Research**: [`fleet-claiming.md`](../research/fleet-claiming.md); [`gitbug-reuse-spike.md`](../research/gitbug-reuse-spike.md)
- **Security**: [`git-native-claims-threat-model.md`](../security/git-native-claims-threat-model.md) — trust boundaries, threats, v1-vs-Phase-3 mitigations, CI guidance
- **Author**: devin (claude-opus-4.x) session 2026-06-02
- **Status**: **design-approved; integration-UNPROVEN** — nothing is "validated" until the
  conformance suite (Step 2) passes against a running adapter (Step 4). The git-bug spike
  proved only *generic convergence*, not our claim/lease/projection model.
- **Validated-by**: an INDEPENDENT fresh-context `reviewer` subagent on 2026-06-02 (cold
  review found 1 residual blocker + 3 majors; all resolved; approved). Prior approvals were
  the same resumed co-author reviewer and didn't count.

## Goal

Specify a **collision-free**, multi-machine task-claim protocol — no two agents ever hold
the same task — and ship the thin glue that proves it (a conformance suite, a thin
reference adapter, one-prompt wiring), **reusing** existing primitives. Hard constraints:
**single repo, no server, no sidecar repo**; target ~tens of always-on machines × per-host
agent fleets (G7). Stay the **thinnest layer that solves the goal** (G6) — heavier
machinery (CRDT engine, server enforcement, heartbeats) must *earn* its way in by measured
need, not be bundled into v1.

## Guarantees (precise — "collision-free", not "deterministic")

- **Collision-free claims:** at most one agent holds a task at a time (git ref CAS is the
  primitive). This is the goal.
- **Deterministic *selection* given a state:** the picker is reproducible for a given
  (TASKS.md, log) snapshot.
- **Eventually-consistent global view:** the *winner of a race* is timing-dependent (whoever
  the remote accepts first); only the *fold of the log* is deterministic. We do **not**
  claim a globally reproducible schedule.

## Locked decisions (operator Q&A + issue-resolution, 2026-06-02)

1. **Pure spec.** Own the spec + conformance suite + a thin reference adapter + one-prompt
   wiring. No engine, no orchestrator.
2. **Engine = linear-CAS first, CRDT only if earned.** v1 starts with **linear-CAS (no
   engine, reuse git's own ref-CAS)**. Prototype a reused CRDT engine (git-bug/grite/
   Automerge-on-git) only if linear-CAS fails conformance or measured contention crosses the
   Phase-4 tripwire. v1 may legitimately have **no engine**.
3. **Single repo only — no sidecar.** Ledger on a `tasks-claims` ref that is excluded from
   normal CI but included by projection/check workflows.
4. **Identity** = `<actor-id>/<instance-id>` (per-process, unique per concurrent agent).
   `actor-id` is a configured or platform login by default; raw git email is optional and
   should not be rendered into public snapshots unless the operator explicitly opts in.
5. **Fully log-first / no duplication.** The `tasks-claims` log is the **sole source of
   truth for ALL task state** (create/claim/release/complete/cancel). `TASKS.md` is a
   **single-writer generated snapshot** on `main`, never hand-edited; agents read the log.
6. **`TASKS.md` is conflict-free by construction:** work PRs touch *code + the log*, never
   `TASKS.md`; a single scheduled job regenerates `TASKS.md` from the log through normal CI.
7. **Contention** = optimistic CAS + silent retry (backoff+jitter) + stateless SHA-256
   pick-dispersion. HRW deferred.
8. **Enforcement (phased, no bypass):** v1 = a client `pre-push` claim check, **path-scoped**
   (code → live claim required; `TASKS.md`/docs → pass). A successful claim yields a
   `claim_id` fencing token; implementation commits carry `Task:` and `Task-Claim:` trailers
   parsed/written with `git interpret-trailers`. Phase 3 = server-side Ruleset + required
   check (same path-scoping) + `pre-receive`, validating both owner mapping and the fencing
   token. The check is mandatory/unbypassable; its *logic* is path-aware (this is what
   dissolves the curation deadlock corporate-safely).
9. **Lease** = a long `lease_expires` field so a dead claim can be reclaimed after TTL
   (cheap, in v1). Heartbeats / offline nuance = Phase 2.
10. **Failure** = release back to queue (`released` event or lease expiry). Poison-guard
    deferred.
11. **Blocked-by** = unclaimable until unblocked; readiness recomputed each pick.
12. **Assume-online precondition** (explicit): the fleet is always-on machines; sleeping
    laptops are out of v1 scope (Phase 2 leases/heartbeat).

## The model (v1)

### One source of truth: the log; `TASKS.md` is a generated view
- **`tasks-claims` ref (same repo, excluded from normal CI)** — append-only log of *every*
  task event: `created` / `updated` / `claimed` / `released` / `completed` / `cancelled`.
  The **sole** live state. Normal build/test CI ignores this branch; only projection and
  claim-check workflows listen to it.
- **`TASKS.md` (on `main`)** — a **generated snapshot** = fold(log), regenerated by ONE
  scheduled job (triggered on `tasks-claims` pushes) via a normal CI'd PR. Always visible +
  git-tracked, but **no agent ever edits it** → it cannot cause merge conflicts, and the
  live state never depends on its freshness (agents read the log).
- **No duplication:** state is in the log only; `TASKS.md` is a render (a materialized
  view), the way a build artifact is — not an independent source.
- **Canonical event format:** every event has `schema_version`, `event_id`, `task_id`,
  `event_type`, `actor_id`, `instance_id`, `created_at`, `parent_event_ids`, and a canonical
  JSON payload. The spec pins serialization (including key order / hash input), duplicate
  handling, malformed-event behavior, and whether a commit carries one event or a batch.

### The `TASKS.md` regeneration job (fully specified — closes the deadlock)
- **Trigger:** a CI workflow `on: push` to the `tasks-claims` ref (near-real-time), plus a
  periodic schedule as a fallback. This is the narrow projection workflow, not the normal
  repo CI suite.
- **Identity:** runs as the CI bot (e.g. `GITHUB_TOKEN` / `tasks-md-bot`) — for
  attribution only; it needs **no special privilege**.
- **Exemption — by uniform path logic, not a per-actor bypass:** the job's change touches
  **only `TASKS.md`**, so the path-scoped required check **passes it by the same rule that
  passes any docs-only PR** — no claim required, no CI bypass. This is the linchpin and it
  is corporate-safe precisely because nothing is exempted *as an actor*; the rule is the
  same for everyone.
- **Single writer ⇒ no merge conflict:** the job is the *only* writer of `TASKS.md`; each
  run re-folds the latest log before pushing. A GitHub Actions `concurrency` group
  serializes runs; the latest wins (and "latest" is correct because it's a pure fold).
- **One branch, one PR:** the job updates a stable branch such as
  `tasksmd/generated-snapshot` and reuses one open PR. If auto-merge is available, it merges
  after ordinary checks pass. If not, snapshot freshness is best-effort and `tasks doctor`
  reports the stale projection; agents still read the log and never depend on the PR.
- **No loop:** the regeneration commit touches `main`/`TASKS.md` only — **not** the
  `tasks-claims` ref — so it never re-triggers itself.
- **Idempotent / crash-safe:** re-running on the same log produces identical bytes; a
  failed run is safely re-run.

### Claim = optimistic CAS (collision-free; reuse git's ref-CAS)
Append a `claimed{id, owner, claim_id, lease_expires}` event to `tasks-claims` → push.
**git's atomic non-ff rejection is the collision-free primitive**: if two agents claim the
same id, exactly one push fast-forwards (wins); the loser is rejected, fetches, sees the live
claim, and **yields → picks next**. Retries are silent: exponential backoff (100 ms→5 s,
~10 attempts) + ±full jitter. A CRDT engine is deferred unless linear-CAS fails conformance
or measured contention crosses the Phase-4 tripwire.

### `next()` / readiness + dispersion
`pick = fold(log).open − {live-claimed} − {blocked}`, ranked by `pickBestTask`, then
**dispersed**: pick the ready task at `hash(instance-id) mod min(K, #ready)` where `hash` =
SHA-256(instance-id) low bits (well-distributed; never length/sum), `K` default ~16. This
spreads N agents across the top-K ready tasks so the deterministic picker doesn't produce a
thundering herd. Blocked-by readiness recomputed each pick; a closed blocker unblocks
dependents; a cycle is never-ready (+ lint warning).

### Enforcement (v1: client, path-scoped, no bypass)
`pre-push` (via lefthook) inspects commits bound for `main`. A change is **claim-exempt
only if EVERY changed path is a non-executable doc** — markdown by extension (`*.md`,
including `TASKS.md`). **Any other path requires a live claim** on the referenced task
(`Task:` trailer / `task/<id>` branch / `Closes`) and matching fencing token
(`Task-Claim:` trailer). Trailers are parsed/written with `git interpret-trailers`, not
custom regex. The extension allowlist covers the code-in-docs loophole: `docs/**/*.py`,
`*.sh`, `*.js`, etc. still require a claim. `post-merge` fetches the log; `prepare-commit-msg`
stamps `Task:` and `Task-Claim:`. Client hooks are ergonomics; the hard, unbypassable
guarantee is the Phase-3 server-side required check with the *same path logic* — which is
corporate-safe because it always runs and decides by path, never bypasses.

## Phasing (v1 solves "avoid conflicts"; the rest earns its way in)

- **Phase 1 (v1 — this plan):** log-first state + collision-free CAS claim + dispersion +
  client path-scoped `pre-push` check + the generated `TASKS.md` snapshot job. Long-lease
  field for dead-claim reclaim. **Solves the stated goal; thin; provable by the suite.**
- **Phase 2:** robust leases + crash/offline handling + heartbeats + log snapshots/compaction.
- **Phase 3:** server-side hard enforcement (Ruleset + required check + `pre-receive`).
- **Phase 4 (only if measured):** adopt a CRDT engine (git-bug/grite/Automerge-on-git) to
  drop the retry loop under high contention; HRW partitioning; per-host batching.

## v1 constraints (explicit preconditions — what v1 does NOT yet cover)
- **Always-on machines.** v1 assumes the fleet is always-on (servers / CI runners). A
  laptop that sleeps holds its claim until the long lease expires — mixed laptop fleets
  need Phase 2 (leases + heartbeat).
- **Client-trusting in v1.** v1's enforcement is the client `pre-push` check (bypassable
  with `--no-verify` / a clone without lefthook). A repo that needs an *unbypassable*
  guarantee must wait for **Phase 3** (server-side required check + `pre-receive`). v1 is
  not "production-enforced everywhere" — it is the collision-avoidance core.
- **Single repo.** Cross-workspace / multi-repo claiming is a follow-up (`fleet-claim-workspace`).

## Scope (in, v1)
- `spec.md` `## Fleet coordination` (the v1 model; conformance-grade).
- `@tasks-md/conformance` — a backend-agnostic, **runnable** conformance suite (the teeth).
- A thin reference adapter (`git-claims` behind `TaskBackend`) — linear-CAS first, with a
  reused engine only if conformance or measured contention requires it.
- The single-writer `TASKS.md`-regeneration job + a path-scoped `pre-push` hook.
- `tasks fleet init` / `doctor` (single-repo wiring).

## Scope (out)
- Sidecar repo — REJECTED (single repo only).
- Server-side enforcement (Ruleset/required-check/`pre-receive`) → Phase 3.
- Robust leases/heartbeat/offline, snapshots/compaction → Phase 2.
- CRDT engine + HRW → Phase 4 (`fleet-claim-engine`, `fleet-claim-hrw-partition`), only if
  the bake-off / measured contention calls for it.
- Poison-guard, signed identity, cross-workspace, hard third-party conformance gate →
  named follow-ups.

## Implementation steps
### Step 1: Spec the v1 protocol (conformance-grade)
`spec.md` `## Fleet coordination` = the v1 model. Verify: greps + `npx -y @tasks-md/lint
TASKS.md` exits 0.

### Step 2: Conformance suite (the proof harness — before any adapter)
Backend-agnostic conformance harness; one test per property: **collision-free** (two clones
claim X → exactly one wins, loser yields), append/merge behavior, **dispersion** (SHA-256
`hash(id) mod min(K,#ready)`; N≤K distinct ids → distinct picks; deterministic), **backoff**
params reproducible, lease-expiry reclaim, `released` re-claimable, blocked-by-unclaimable +
unblock-on-close, canonical serialization (duplicates, malformed events, unknown versions,
reordered keys), `claim_id` fencing, **single-source invariant** (`TASKS.md == fold(log)`;
no state in `TASKS.md`), **no-`TASKS.md`-conflicts** (a work change + a concurrent completion
never conflict on `TASKS.md`, because work never touches it), **path-scoped enforcement**
(code-without-claim rejected; docs-only passes). Keep this internal-first until at least two
real adapters pass; publish it only after the interface stabilizes. Verify: the suite **fails
a deliberately-broken stub**.

> **Status (Step 2 done):** `packages/conformance/` ships the runnable harness — a
> `ConformanceTarget` contract + `runConformance()` runner + 11 checks. An in-memory
> reference target passes all 11; a deliberately-broken stub fails exactly 5 (same-task
> race, lease-steal, claim fencing, idempotent projection, path-scoped enforcement). The
> package is `private` until file/Issues/git-native adapters exercise it (public path =
> `backend-conformance-self-certification`).

### Step 3: Linear-CAS first; CRDT only if earned
The engine choice is deferred *until the conformance suite is written*, so the suite drives
the decision. Implement a **linear-CAS prototype first** (reuse git ref-CAS; no engine). If
it passes conformance and contention metrics stay below the Phase-4 tripwire, ship it as v1.
Prototype a reused CRDT engine (git-bug, grite, Automerge-on-git, or a later better fit)
only when linear-CAS fails conformance or measured contention justifies the dependency.
Record adapter LOC, dependency/licence cost, and contention behavior for whichever path is
chosen.

> **Status (Step 3 done — linear-CAS wins):** the git-native backend (linear-CAS, the only
> "engine" is git's ref-CAS) was run against `@tasks-md/conformance` and passes 6/6
> applicable checks. v1 ships with **no CRDT engine** (0 new deps). The bake-off evidence
> table + the real bug the suite caught are in
> [`../research/gitbug-reuse-spike.md`](../research/gitbug-reuse-spike.md) § "Bake-off RESULT".

### Step 4: Thin reference adapter (`git-claims`)
Implement the chosen path behind `TaskBackend`: `claim` = silent-retry CAS; `next` = the
reconciled+dispersed picker over the log; `complete`/`release`/`cancel`/`create` = log
appends. Verify: the Step-2 suite passes against the adapter.

> **Status (Step 4 done):** `git-native` is wired into `.tasksmd.json`/`createBackend`,
> implements create/update/claim/release/complete/cancel/render over the log, verifies
> claim win/loss against the remote (non-ff → yield), and silent-retries append ops with
> bounded backoff+jitter. It passes `@tasks-md/conformance`. Engine = linear-CAS, no CRDT.

### Step 5: Generated `TASKS.md` + client enforcement
The single-writer regeneration job (on `tasks-claims` push → render fold(log) → update the
stable generated-snapshot PR) + the path-scoped `pre-push` hook +
`prepare-commit-msg`/`post-merge`. Verify: a work change + a concurrent completion produce
**no `TASKS.md` conflict**; `pre-push` rejects unclaimed code, passes a docs-only change,
and validates `Task-Claim`.

### Step 6: `tasks fleet init` / `doctor` (single-repo, idempotent)
Wire the ledger ref, the regeneration workflow, lefthook, `.tasksmd.json`, `/next-task`.
Verify: fresh-repo init → ref + workflow + hooks + config present; `doctor` exits 0; second
run no-op.

## Risks and mitigations
- **Curation/projection deadlock** (the prior blocker). → Resolved: queue ops are log
  appends (no claim, no `main` PR); the required check is **path-scoped** (code→claim,
  docs→pass) and **never bypasses CI** — corporate-safe.
- **`TASKS.md` merge conflicts in a no-bypass repo.** → Resolved by construction: agents
  never edit `TASKS.md`; a single scheduled writer regenerates it from the log through
  normal CI; the picker reads the log so staleness is cosmetic.
- **"Validated" overstated.** → Status downgraded; the conformance suite + Step-4 adapter
  is the gate that earns "validated"; leases/snapshots/projection are explicitly unproven.
- **"Thin adapter" hides engine scope.** → Resolved by linear-CAS first and measured
  tripwires before adding a CRDT dependency; v1 likely has **no engine**.
- **Over-engineering vs G6.** → Phasing: v1 is the minimal conflict-avoidance core; leases,
  server enforcement, CRDT engine are later phases gated on measured need.
- **Offline / laptop sleep.** → Explicit assume-online precondition; long-lease backstop;
  Phase 2 owns heartbeat/offline. The `pre-push`/required check stops a lost owner pushing.
- **Conformance honor-system for third parties.** → `@tasks-md/conformance` is runnable +
  a required gate for the reference adapter; third parties self-certify (registry gate
  deferred).
- **Contention retry churn (linear-CAS).** → dispersion + low claim rate (long tasks) +
  jittered backoff; if metrics cross the Phase-4 tripwire, adopt a reused CRDT engine or
  per-host batching to drop retries.

## Acceptance criteria (v1)
1. Spec is conformance-grade (greps + lint exit 0).
2. `@tasks-md/conformance` exists, **fails a deliberately-broken stub**, and **passes the
   reference adapter**. The suite is a **gate, not a checkbox** — no implementation (incl.
   the engine bake-off) lands until the suite exists and passes; it is the proof the design
   is correct.
3. **Collision-free:** two clones claim X concurrently → exactly one wins; loser yields.
4. **Single source:** a test asserts `TASKS.md == fold(log)` and that no state lives in
   `TASKS.md`; the picker excludes a log-`completed` task whose snapshot block still exists.
5. **No `TASKS.md` conflicts:** a work change + a concurrent completion never conflict on
   `TASKS.md` (work never touches it); the regeneration job is single-writer.
6. **Dispersion + backoff:** SHA-256 `hash(id) mod min(K,M)` → N≤K distinct ids pick distinct
   tasks (deterministic); backoff params pinned.
7. **Lease + lifecycle:** expired claim reclaimable; `released` re-claimable; lifecycle events
   fold correctly.
8. **Blocked-by:** unclaimable until unblocked.
9. **Path-scoped enforcement (no bypass; extension-allowlist):** `pre-push` rejects an
   unclaimed change touching any non-`*.md` path (incl. `docs/**/*.py|*.sh`), passes a
   markdown-only change; a test covers the code-in-docs case. (Phase 3) the server
   required-check enforces the same by path. Documented limit: client hooks are bypassable
   in v1 — Phase 3 is the unbypassable layer (see v1 constraints).
10. **Engine decision recorded:** linear-CAS ran the suite first; any CRDT prototype is
    justified by conformance failure or contention metrics. If an engine is used it is
    REUSED, not built.
11. Determinism of *selection* preserved: existing `pickBestTask` tests pass unchanged.
12. Full gate green: `npm run build && npm test && npm run lint`.

## Reviewer verdict

- **Verdict**: approved (by an INDEPENDENT fresh-context reviewer — not the plan's co-author)
- **Reviewer**: fresh `reviewer` subagent (cold, no prior involvement)
- **Date**: 2026-06-02
- **Concerns**:
  - (none — the cold review first found a residual blocker (under-specified regeneration job) + 3 majors; all resolved: the job's exemption is by uniform path logic not a per-actor bypass (no deadlock in a no-bypass repo, no loop, single-writer ⇒ no conflict); the path-scoped check is an extension allowlist (code-in-docs loophole closed); v1's preconditions are explicit (always-on, client-trusting, single repo); the conformance suite is a gate; engine choice deferred until the suite drives it.)
- **Approval rationale**:
  - Sound, specific, and corporate-safe. Collision-free is proven by git ref-CAS; the fully-log-first design with a single-writer generated `TASKS.md` removes the original one-file merge problem and the curation deadlock without bypassing CI; the design is thin (G6) and phased honestly (v1 = collision-avoidance core; leases/server-enforcement/CRDT engine earn their way in later). Integration remains unproven until the conformance suite passes against the Step-4 adapter — which is the explicit gate.
