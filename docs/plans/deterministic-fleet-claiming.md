# Plan: deterministic fleet claiming — spec + conformance + thin reference adapter

- **Task**: `deterministic-fleet-claiming`
- **Repo**: `~/apps/tooling/tasks.md`
- **Research**: [`fleet-claiming.md`](../research/fleet-claiming.md) (prior art + mechanics + competitive landscape); [`gitbug-reuse-spike.md`](../research/gitbug-reuse-spike.md) (reuse spike — git-bug convergence confirmed; candidate sweep)
- **Author**: devin (claude-opus-4.x) session 2026-06-02
- **Status**: validated (FULL plan after operator edge-case Q&A 2026-06-02)
- **Validated-by**: `reviewer` subagent on 2026-06-02 (full plan — first pass needs-revision on 2 param specs; second pass approved)

## Goal

tasks.md **specifies** a deterministic, collision-free, multi-machine task-claim protocol
and ships only the thin glue that proves and enables it — a **conformance test suite**, a
**thin reference adapter**, and a **one-prompt wiring command** — while **reusing** an
existing engine for the ledger and existing tools for enforcement. It builds **no ledger
engine and no orchestrator** (VISION G6). Hard constraints: **single repo, no server**
(the ledger is a branch/ref *inside the repo where the work happens* — **never a sidecar
repo**); target a team of **~tens of machines** × per-host agent fleets (G7).

## Why

`(@agent)` claims race (post-push visibility + deterministic picker ⇒ guaranteed
collisions); `tasks claim` is a no-op (`packages/cli/src/backend/tasks-md.ts:84`); a
`/next-task` *skill* can't *guarantee* "claim before work" (only hooks + server rules can);
adoption must be one prompt. The reuse spike empirically confirmed the model
(git-bug converges to a deterministic winner across clones) and the GitHub
**~6 pushes/min/repo** soft ceiling. This plan turns the operator's edge-case decisions
(below) into a buildable, conformance-tested v1.

## Locked decisions (operator Q&A, 2026-06-02)

1. **Pure spec.** Own the spec + a conformance suite + a thin reference adapter + one-prompt
   wiring. No engine, no orchestrator.
2. **Reuse the ledger engine** (deferred final pick — shortlist git-bug / grite /
   Automerge-on-git; chosen at impl time by prototyping against the conformance suite,
   behind an adapter interface). Radicle COBs ruled out (require the Radicle P2P network).
3. **Single repo only — no sidecar repo.** Ledger on a dedicated, CI-excluded `tasks-claims`
   ref in the same repo.
4. **Identity** = `<git-email>/<instance-id>` — git committer identity + a per-process
   instance id (uuid/pid), stable for a task's lifetime, unique per concurrent agent on a
   host. Self/git trust for v1; signed claims deferred.
5. **Lease** = long lease, no heartbeat (TTL configurable, default > longest expected task).
6. **Contention** = optimistic CAS + **silent retry** (backoff+jitter) + **stateless
   id-hashed pick-dispersion** (no roster, no steal). Full HRW + work-stealing deferred.
7. **Push handling** = per-task claim + silent retry; no batching/budget. GitHub's
   ~6/min/repo is a *soft* limit → degrades latency, never correctness.
8. **Failure** = release back to queue (explicit `released` event or lease expiry). No
   attempt-counter / failed-state in v1 (poison-task guard deferred).
9. **Enforcement** = strict full-belt: lefthook (client) + GitHub Ruleset + a **required
   check that every PR to `main` has a live claim by its author** + `pre-receive`
   (GHE/GitLab/Gitea). No bypass; hotfixes need a task too.
10. **Blocked-by** = a task with unsatisfied blockers is unclaimable; readiness recomputed
    each pick.
11. **No duplication / log-first** = the **claim log is the single source of truth for
    state**; **TASKS.md holds only authored task *definitions*** and is a projection target
    (terminal events remove blocks). Only the task ID is shared. Log wins on disagreement.
12. **Winner** = the reused engine's embedded **Lamport total order** (deterministic across
    clones; skew-immune).

## The model (detailed)

### Two surfaces, no duplication
- **`TASKS.md` (on `main`)** — authored open-task **definitions** only (id, title, priority,
  tags, blocked-by, details). Source of truth for *what work exists*.
- **Claim log (`tasks-claims` ref, same repo)** — append-only **event** stream of state
  transitions: `claimed` / `released` / `completed` / `cancelled` (+ `snapshot` for
  compaction). Source of truth for *live state*. The reused engine provides the
  append-only-on-git + Lamport-ordered fold.
- **No duplication:** claim/done state lives ONLY in the log; the only datum shared with
  TASKS.md is the task **ID** (a reference). There is no `[x]` / done flag in TASKS.md.
- **Projection (log-first):** events are written first; applying the log's **terminal**
  events (`completed`/`cancelled`) to TASKS.md **removes** those blocks. TASKS.md =
  authored-definitions − log-closed. The **picker excludes log-closed tasks directly**, so
  it is correct even before the projection runs; the projection just keeps the
  human-readable file tidy. On disagreement (sync lag) the **log wins**; TASKS.md
  re-projects.

### `next()` / readiness (single, reconciled view)
`pick = TASKS.md open defs − {log-closed} − {live-claimed} − {blocked}`, ranked by
`pickBestTask`, then **dispersed**: among the top-K ready tasks an agent offers itself the
one at `hash(instance-id) mod min(K, #ready)` (stateless herd-dispersion). `hash` is a
**well-distributed digest** (SHA-256 of the instance-id, take the low bits) — never a
length/sum — so distinct ids spread evenly across the top-K; `K` is configurable (default
~16). Blocked-by
readiness is recomputed each pick from TASKS.md + the log-closed set; a cancelled/completed
blocker unblocks dependents; a cycle is never-ready (+ lint warning).

### Claim = optimistic CAS (single repo, silent retry)
Append a `claimed{id, owner, lamport, lease_expires}` event to the `tasks-claims` ref →
push. On non-ff rejection / rate-limit: fetch, fold; if a live `claimed` for `id` already
won → **yield, pick next**; else re-apply (unique event filename) and re-push. Retries are
**silent** with **exponential backoff (100 ms initial, 5 s cap, ~10 attempts) + ±full
jitter** — the jitter de-synchronizes a herd of retriers so they don't re-amplify the
burst. Winner = lowest Lamport tuple (engine-provided), so two clones always agree.

### Identity
`<git-email>/<instance-id>`; the instance id is per-process (uuid/pid), so N identical
agents on one host each have a distinct owner string. Stable for a task's lifetime.

### Lease & crash / resurrection / offline
- Long lease (no heartbeat). A crashed machine's task is reclaimable after the TTL.
- **Reclaim:** another agent appends a fresh `claimed` for the expired task; by Lamport
  order it becomes the owner.
- **Resurrected / offline-too-long owner:** on next sync the original owner sees it no
  longer owns the task (a later `claimed` won, or the block is gone) → it **discards its
  work and does not push** (the strict enforcement check + Ruleset also block a push by a
  non-owner). No fencing token needed given long-lease + log-order winner.
- **Offline (assume-online):** claiming a *new* task needs the remote (CAS) → offline = no
  new claims; an in-flight claim survives a network blip (holder syncs completion on
  reconnect); offline beyond the TTL risks losing the task (discard on reconnect).

### Lifecycle
`claimed → completed` (event → projection removes block) | `released` (gave up/error →
claimable again) | `cancelled` (human removed the task → event → block removed). Lease
expiry = implicit release. No `failed` state / attempt counter in v1 — a released poison
task may be re-picked (poison-guard is a deferred follow-up).

### Enforcement (strict, full-belt)
- **Client (lefthook):** `pre-push` blocks a `main`-bound work push unless the actor holds
  a live claim on the task(s) it references (`Task:` trailer / `task/<id>` branch /
  `Closes`); `post-merge` fetches the ledger; `prepare-commit-msg` stamps `Task: <id>`.
- **Server (github.com):** a **Repository Ruleset** on `tasks-claims` (no force-push, no
  delete, linear) + a **required status check** on PRs to `main` = "the PR **author** holds
  a live claim for the referenced task." **Strict:** every PR to `main` must reference a
  claimed task by its author; hotfixes need a task; **no bypass**.
- **Server (GHE / GitLab / Gitea):** a `pre-receive` hook is the strongest layer (reject
  unclaimed `main` pushes + non-append ledger pushes).

### Setup (`tasks fleet init` / `doctor`, single-repo, idempotent)
Creates the `tasks-claims` ref; writes `.tasksmd.json` (`backend`, `claimsRef`,
`leaseTtlSec`); installs lefthook + the CI workflows (ledger excluded from the build; the
required-check); best-effort applies the Ruleset via `gh` (prints the manual command when
admin is required); installs `/next-task`. `doctor` reports which pieces are in place.

## Scope (in)
- `spec.md` `## Fleet coordination` capturing the whole model above (conformance-grade).
- A backend-agnostic **conformance test suite** (the spec's teeth).
- A **thin reference adapter** (`git-claims` behind `TaskBackend`) driving the reused
  engine + the **projection** step + dispersion + silent-retry CAS.
- `tasks fleet init` + `tasks fleet doctor` (single-repo wiring).

## Scope (out)
- **Sidecar claims repo — REJECTED** (operator constraint: single repo only).
- HRW + work-stealing (v1 uses stateless dispersion) → `fleet-claim-hrw-partition`.
- Heartbeat liveness → `fleet-claim-heartbeat-liveness`; poison-task attempt-counter/`failed`
  state → `fleet-claim-poison-guard`; queue backend → `fleet-claim-queue-backend`;
  per-host batching/budget → `fleet-claim-coordinator-daemon`; signed claims →
  `fleet-claim-signed-identity`; cross-workspace multi-repo claiming →
  `fleet-claim-workspace`; hard third-party conformance CI gate → follow-up.
- Final engine pick (spike-resolved direction; chosen at impl behind the interface).

## Implementation steps

### Step 1: Spec the protocol (conformance-grade)
`spec.md` `## Fleet coordination` = the full model. Verify: `grep -c "Fleet coordination"
spec.md` ≥ 1, `grep -c "leaseTtlSec" spec.md` ≥ 1, `npx -y @tasks-md/lint TASKS.md` exits 0.

### Step 2: Conformance suite (the proof harness — before the adapter)
Backend-agnostic; one test per edge case: two-clone collision (same Lamport winner),
append auto-merge, **dispersion** (SHA-256-based `hash(id) mod min(K,#ready)` — N≤K distinct
ids pick distinct tasks; deterministic per id), **silent-retry backoff** (100 ms→5 s cap,
~10 attempts, ±full jitter — reproducible), lease-expiry reclaim, `released` re-claimable,
blocked-by-unclaimable + unblock-on-close, `completed`/`cancelled` projection,
**no-duplication invariant** (state only in the log; TASKS.md holds no done flag),
log-wins-on-disagreement (picker excludes a log-`completed` task whose block still exists),
and enforcement (unclaimed push rejected). Verify: the suite **fails a deliberately-broken
stub** and is the documented conformance entry point.

### Step 3: Resolve the engine reuse (spike-resolved; prototype the shortlist)
Prototype git-bug / grite / Automerge-on-git against the Step-2 suite; pick behind the
adapter interface; record the choice. Verify: smoke test claims + reads back via the engine.

### Step 4: Thin reference adapter (`git-claims`) over the reused engine
`config.ts`/`index.ts` + `git-claims.ts`: `claim` = silent-retry CAS; `next`/`listOpen` =
the reconciled+dispersed picker; `complete`/`release`/cancel = append the event; a
**projection** step applies terminal events to TASKS.md. Verify: the Step-2 suite passes
against the adapter.

### Step 5: Full-belt enforcement
lefthook config + the required-check workflow (PR author ⇒ live claim) + the ledger Ruleset
+ a `pre-receive` script. Verify: `pre-push` rejects unclaimed / passes claimed; the
required-check rejects a no-claim PR; the build workflow excludes the ledger ref.

### Step 6: `tasks fleet init` / `doctor` (single-repo, idempotent)
Compose Steps 1–5 in one command + a diagnostic. Verify: fresh-repo init →
`git config core.hooksPath` set + ledger ref exists + `.tasksmd.json` + workflows; `doctor`
exits 0; a second init is a no-op.

## Risks and mitigations

- **Soft push limit at cold start.** ~6/min/repo, single repo (no sidecar).
  - Mitigation: stateless **dispersion** spreads first-picks across ready tasks (kills the
    O(N²) herd) + **silent backoff (100 ms→5 s, ~10 attempts) with ±full jitter** — the
    jitter de-synchronizes retriers so they don't re-amplify the burst; the limit is soft →
    latency degrades, never correctness. Batching/HRW are deferred follow-ups if a real
    fleet sustains a high rate.
- **Poison task** (no attempt counter; release-back may re-pick forever).
  - Mitigation: documented; `fleet-claim-poison-guard` (attempt counter / `failed` state) is
    the fast-follow.
- **Resurrected / offline-too-long owner pushes stale work.**
  - Mitigation: Lamport-order winner is authoritative; holder discards on detecting loss;
    strict enforcement (Ruleset + required check) blocks a non-owner's push.
- **Projection lag** (TASKS.md behind the log).
  - Mitigation: the **picker reads the log directly** (excludes log-closed), so it's correct
    regardless; the projection only tidies TASKS.md; log wins.
- **Strict-enforcement friction** (bot/teammate merges, hotfixes).
  - Mitigation: operator chose strict — author must own the claim; documented; a label-based
    exception is a follow-up if it bites.
- **Engine reuse unresolved.** Adapter targets an interface; the conformance suite is the
  bake-off; GPL boundary respected by subprocess (no linking).
- **Clock skew.** Winner is Lamport (skew-immune); lease is coarse + NTP.
- **id collision** (two agents same instance-id). Instance id includes uuid/pid → negligible;
  a conformance test asserts owner-uniqueness.
- **Ledger ref integrity / CI noise.** Ruleset blocks force-push/delete; the build workflow
  excludes `tasks-claims`; `pre-receive` enforces append-only where available.

## Acceptance criteria

1. Spec is conformance-grade: `grep -c "Fleet coordination" spec.md` ≥ 1,
   `grep -c "leaseTtlSec" spec.md` ≥ 1, `npx -y @tasks-md/lint TASKS.md` exits 0.
2. **Conformance suite** exists, fails a broken stub, passes the reference adapter
   (`npm test` exits 0).
3. **Collision:** two clones append `claimed{X}` concurrently → both agree on the same
   Lamport winner; loser gets `{won:false}`.
4. **No duplication:** a test asserts state (claim/done) appears ONLY in the log — TASKS.md
   carries no done flag — and that the picker excludes a log-`completed` task even while its
   block still exists in TASKS.md (projection lag), proving the **log wins**.
5. **Dispersion:** with the SHA-256-based `hash(id) mod min(K,M)`, N≤K simulated agents with
   distinct instance-ids first-pick **distinct** tasks (collision-resistance), and each id's
   pick is deterministic across runs (no roster). A separate test pins the backoff params
   (100 ms→5 s, ~10 attempts, ±full jitter) for reproducibility.
6. **Lease + lifecycle:** expired claim is reclaimable; `released` returns to claimable;
   `completed`/`cancelled` events project to block removal (unit + integration).
7. **Blocked-by:** a task with unsatisfied blockers is unclaimable; closing the blocker makes
   it claimable.
8. **Enforcement (strict):** `pre-push` rejects an unclaimed work push and passes a claimed
   one; the required-check logic rejects a PR whose author lacks a live claim; the build
   workflow excludes the ledger ref; the Ruleset config blocks force-push/delete.
9. **One-prompt setup:** fresh-repo `tasks fleet init` → hooks (`git config core.hooksPath`)
   + ledger ref + `.tasksmd.json` (`backend: git-claims`) + workflows; second run no-op;
   `tasks fleet doctor` exits 0.
10. **Reuse, not build:** the adapter drives a REUSED engine — verifiable by grepping the
    adapter for the engine shell-out/dependency and the absence of a bespoke CRDT/merge
    engine in tasks.md packages.
11. Determinism preserved: existing `pickBestTask` tests pass unchanged.
12. Full gate green: `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

- **Verdict**: approved (full plan; second pass — first pass needs-revision on 2 specs, resolved)
- **Reviewer**: `reviewer` subagent (plan-validation profile)
- **Date**: 2026-06-02
- **Concerns**:
  - (none — first pass flagged two under-specified params: the dispersion hash (now SHA-256, well-distributed, K default ~16, collision-resistance tested) and the silent-retry backoff (now 100 ms→5 s, ~10 attempts, ±full jitter, pinned in Step 2 + acceptance + Risks). Both resolved.)
- **Approval rationale**:
  - The model is internally consistent — the no-duplication / log-first design (log = state, TASKS.md = definitions + projection) keeps the picker correct under projection lag, stateless SHA-256 dispersion avoids the deterministic-picker herd while staying deterministic-per-agent, single-repo + silent-retry under the soft push limit degrades latency not correctness, and strict enforcement (Ruleset + required-check) makes the no-fencing-token crash/resurrection path safe. All 12 acceptance criteria are falsifiable and the conformance suite (Step 2, before the adapter) covers every decided edge case. Ready for implementation.
