# Plan: deterministic fleet claiming — spec + conformance + thin reference adapter

- **Task**: `deterministic-fleet-claiming`
- **Repo**: `~/apps/tooling/tasks.md`
- **Research**: [`docs/research/fleet-claiming.md`](../research/fleet-claiming.md) (prior art + mechanics + competitive landscape)
- **Author**: devin (claude-opus-4.x) session 2026-06-02
- **Status**: validated (PURE-SPEC reframe after operator review 2026-06-02)
- **Validated-by**: `reviewer` subagent on 2026-06-02 (pure-spec reframe — approved)

## Goal

tasks.md **specifies** a deterministic, collision-free, multi-machine claim protocol and
ships only the thin glue that proves and enables it — a **conformance test suite**, a
**one-prompt wiring command**, and a **thin reference adapter** — while **reusing** existing
engines for the hard parts: **git-bug's** append-only Lamport-clock op-log as the claim
ledger, and **lefthook + GitHub Rulesets + `pre-receive`** for enforcement. tasks.md builds
**no ledger engine and no orchestrator** (VISION G6: thinnest layer; operator decision
2026-06-02 — "pure spec, as thin as possible, yet requirements fully met"). Target: a team
of **~tens of machines** × per-host agent fleets, git-native, no server (G7).

## Why

Four drivers:

1. **Best-effort races + no claim primitive.** `(@agent)` claims are post-push and
   `pickBestTask` is deterministic → guaranteed collisions; `tasks claim` is a no-op
   (`packages/cli/src/backend/tasks-md.ts:84`).
2. **Skills are probabilistic → enforcement must be deterministic.** A `/next-task` skill
   can't *guarantee* "claim before work"; only hooks + server-side rules can.
3. **Adoption must be one prompt** or teams wire it wrong.
4. **Operator review (2026-06-02):** pure-spec (own the format + protocol + conformance,
   not the engine); **reuse git-bug** (don't reimplement); **full-belt** enforcement;
   **medium scale**. Research ([`fleet-claiming.md`](../research/fleet-claiming.md)) proved
   the git-bug model (production since 2018) and the GitHub **~6 pushes/min/repo** ceiling
   that makes per-host batching + an optional sidecar claims repo necessary at this scale.

The thinness insight: the only thing nobody else ships is a **portable conformance spec**
for cross-machine-over-git claiming. So tasks.md owns the spec + the test suite that makes
"requirements met" *verifiable*, plus a thin reference adapter that proves it by composing
reused tools — not another engine.

## Scope (in) — what tasks.md owns

- **`spec.md` § Fleet coordination** — the claim protocol, precise enough to be
  conformance-testable: append-only event ledger on a dedicated `tasks-claims` branch;
  winner = embedded **Lamport total order** `(lamport, actor_id, content_hash)`; the fold +
  `snapshot` compaction; TTL lease; `@machine/agent` identity; the **full-belt enforcement
  requirements**; the **medium-scale deployment** (per-host batching, optional sidecar
  claims repo); `.tasksmd.json` fields (`backend`, `claimsRef`, `leaseTtlSec`).
- **A conformance test suite** — the mechanism that makes "requirements provably met" real;
  runnable against ANY backend that asserts conformance (the reference adapter and any
  third-party tool). This is tasks.md's enforcement of the spec.
- **A thin reference adapter** (`git-claims` behind the existing `TaskBackend` seam) that
  satisfies the spec by **driving a reused ledger engine** (git-bug the leading candidate)
  — never a hand-rolled engine — plus **minimal per-host batching** (one pusher/host) for
  the push ceiling.
- **`tasks fleet init` + `tasks fleet doctor`** — one-prompt idempotent wiring that
  *composes the reused tools*: ledger engine, lefthook hooks, GitHub Rulesets + required
  check, `pre-receive` where available; writes `.tasksmd.json`; installs `/next-task`.
  Extends `one-prompt-setup`.

## Scope (out)

- **OPEN SPIKE — the git-bug reuse mechanism** (binary shell-out vs. library vs.
  contributing a `claim`/`lease` entity upstream). Operator undecided ("not sure"); the
  adapter is written to an interface so the spike picks the mechanism. →
  `fleet-claim-gitbug-reuse-spike`.
- **Building any ledger engine or orchestrator** — explicitly NOT (reuse).
- Coordinator daemon beyond minimal per-host batching, HRW partition, ref-sharding →
  `fleet-claim-coordinator-daemon`, `fleet-claim-hrw-partition`, `fleet-claim-ref-sharding`.
- Heartbeat liveness (per-machine refs); v1 uses a lease only →
  `fleet-claim-heartbeat-liveness`.
- **Server-queue backend (pgmq/River)** — only past the medium-scale trip-wire →
  `fleet-claim-queue-backend`.
- The canonical setup *prompt text* lands in `one-prompt-setup`.

## Implementation steps

### Step 1: Spec the protocol (conformance-grade)

Write `spec.md` `## Fleet coordination` covering everything in Scope (in) bullet 1, written
so each requirement maps to a test. Verify: `grep -c "Fleet coordination" spec.md` ≥ 1,
`grep -c "leaseTtlSec" spec.md` ≥ 1, `npx -y @tasks-md/lint TASKS.md` exits 0.

### Step 2: Conformance test suite (the proof harness — write before the adapter)

A backend-agnostic suite that drives a backend through the protocol and asserts every
requirement (collision, append-merge, fold determinism, snapshot, lease reclaim,
reconciliation, enforcement). Verify: the suite runs and **fails a deliberately-broken
stub backend** (proving it has teeth) and is documented as the conformance entry point.

### Step 3: Resolve enough of the reuse spike to wire the engine

Evaluate the git-bug reuse mechanism (binary shell-out vs. lib) far enough to drive it from
the adapter; record the choice + rationale in the spike task and the research doc. Verify:
a smoke test claims + reads back through the reused engine.

### Step 4: Thin reference adapter over the reused engine

Implement `git-claims` behind `TaskBackend` (`config.ts`/`index.ts` + `git-claims.ts`),
delegating ledger ops to the reused engine and adding minimal per-host batching. Verify:
the **conformance suite (Step 2) passes against the adapter**, including the two-clone
collision test.

### Step 5: Full-belt enforcement

Ship the lefthook config (`pre-push` claim-before-work, `post-merge` ledger fetch,
`prepare-commit-msg` task trailer), the GitHub Actions required-check workflow (reads the
ledger, asserts a live `claimed` by `github.actor`), and a `pre-receive` script for
GHE/GitLab/Gitea. Verify: a test drives `pre-push` (rejects unclaimed, passes claimed); a
test of the required-check logic (rejects a PR with no live claim); the build workflow
excludes the claims ref.

### Step 6: One-prompt wiring (`tasks fleet init` / `doctor`)

Compose Steps 1–5's reused tools in one idempotent command + a diagnostic. Verify: on a
fresh temp repo, `tasks fleet init` → `git config core.hooksPath` is set + ledger ref
exists + `.tasksmd.json` has `backend: git-claims` + workflows installed; `tasks fleet
doctor` exits 0; a second `tasks fleet init` is a no-op.

## Risks and mitigations

- **Risk: the reuse mechanism is unresolved (operator "not sure").**
  - Mitigation: the adapter targets an interface; `fleet-claim-gitbug-reuse-spike` (Step 3)
    picks binary-shell-out vs. lib vs. upstream-contribution before the adapter hardens; a
    GPL boundary is respected by shelling out to a separate binary (no linking).
- **Risk: pure-spec means tasks.md can't *force* third-party backends to be correct.**
  - Mitigation: the **conformance suite IS the guarantee** — a backend is "tasks.md fleet
    conformant" iff it passes; the reference adapter is the existence proof.
- **Risk: winner non-determinism / clock skew.** Git commit order is unstable on concurrent
  ties (research §1).
  - Mitigation: winner = embedded **Lamport total order** `(lamport, actor_id,
    content_hash)` (git-bug's model), independent of git ordering; ledger kept linear
    (rebase-only) as defense-in-depth; lease is coarse + NTP.
- **Risk: push-throughput ceiling.** GitHub recommends **≤ ~6 pushes/min/repo** (research §2).
  - Mitigation: per-host batching is **in the reference adapter** (one pusher/host), not a
    late add; the limit is **per-repo** so ref-sharding within a repo doesn't help — a
    **sidecar claims repo** does; **trip-wire** past medium scale → `fleet-claim-queue-backend`.
- **Risk: client hooks are bypassable.**
  - Mitigation: full-belt — server-side **Rulesets + required check** (bypass-proof on
    github.com) and **`pre-receive`** (GHE/GitLab/Gitea, strongest); lefthook is the local
    ergonomic layer. (Adopt lefthook; don't hand-roll the installer — research §3.)
- **Risk: setup needs admin (Rulesets/pre-receive).**
  - Mitigation: `tasks fleet init` does what `gh` permits, prints the exact manual command
    for the rest; `tasks fleet doctor` reports gaps.
- **Risk: ledger ↔ TASKS.md drift / event-format evolution / snapshot staleness.**
  - Mitigation: read-time reconciliation; `completed`/`cancelled` events; `v` schema field
    (unknown/newer `v` = opaque-but-live); snapshot validated reachable, else full fold.

## Acceptance criteria

1. Spec is conformance-grade: `grep -c "Fleet coordination" spec.md` ≥ 1,
   `grep -c "leaseTtlSec" spec.md` ≥ 1, `npx -y @tasks-md/lint TASKS.md` exits 0.
2. **Conformance suite exists**, fails a deliberately-broken stub, and passes the reference
   adapter (`npm test` exits 0).
3. **Collision (core gate, as a conformance test):** two clones append `claimed{X}`
   concurrently → both agree on the SAME winner by the Lamport order; loser gets
   `{won:false}`.
4. Append auto-merge: different-task events both land, no manual conflict.
5. fold determinism + winner = min `(lamport, actor_id, content_hash)` + snapshot validation
   + `isClaimLive` boundaries (unit tests).
6. `next()`/`listOpen()` reconcile (skip live-claimed; ignore claims for absent tasks;
   surface expired).
7. `complete(id)` removes the `TASKS.md` block + appends `completed`; cancel appends
   `cancelled`.
8. **Full-belt enforcement:** `pre-push` rejects an unclaimed work push (client); the
   required-check logic rejects a PR with no live claim by the author (server); the Ruleset
   blocks force-push/delete on the ledger ref; a `pre-receive` script rejects an unclaimed
   push (where the host supports it).
9. **One-prompt setup:** `tasks fleet init` on a fresh temp repo yields hooks
   (`git config core.hooksPath`) + ledger ref + `.tasksmd.json` (`backend: git-claims`) +
   workflows; second run no-op; `tasks fleet doctor` exits 0.
10. **Reuse, not build:** the reference adapter drives a REUSED engine — no hand-rolled
    ledger (verifiable by grepping the adapter for the git-bug shell-out / dependency, and
    by the absence of a bespoke CRDT/merge engine in tasks.md packages).
11. Determinism preserved: existing `pickBestTask` tests pass unchanged.
12. Full gate green: `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

- **Verdict**: approved (pure-spec reframe)
- **Reviewer**: `reviewer` subagent (plan-validation profile)
- **Date**: 2026-06-02
- **Concerns**:
  - (none — the reframe is internally consistent: spec → conformance suite → thin adapter over a reused engine; no remnants of the old build-it framing; the reuse mechanism is correctly an explicit spike gating the adapter; acceptance #2/#10 are falsifiable; per-host batching is justified as necessary at medium scale, not an optional optimization.)
- **Approval rationale**:
  - tasks.md correctly owns the portable protocol spec + the conformance suite (the enforcement mechanism), while delegating the ledger to git-bug (reuse, not build) and enforcement to lefthook + Rulesets + `pre-receive`. The conformance suite is the TDD harness that proves any backend; the reuse mechanism is sequenced as a spike (Step 3) gating the adapter (Step 4), written to an interface so it doesn't block. All acceptance criteria are falsifiable and no contradictions remain from the build-it framing.
