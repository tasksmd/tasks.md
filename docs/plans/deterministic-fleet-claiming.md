# Plan: git-native deterministic fleet claiming

- **Task**: `deterministic-fleet-claiming`
- **Repo**: `~/apps/tooling/tasks.md`
- **Author**: devin (claude-opus-4.x) session 2026-06-02
- **Status**: validated (event-log + enforcement redesign)
- **Validated-by**: `reviewer` subagent on 2026-06-02 (redesign: first pass needs-revision; second pass approved after resolving the six concerns)

## Goal

Let a team of machines — each running a parallel fleet of agents — pull from one
`TASKS.md` queue with **zero duplicate work** and **deterministic selection**, git-native
(no server). The model has two planes: `TASKS.md` on `main` is the queue (task
definitions, edited as plain markdown); an **append-only event log** on a dedicated,
CI-excluded ref is the claim ledger. The protocol is enforced **deterministically by git
hooks + branch protection + a CI check** — not just the `/next-task` skill — so it works
reliably in *any* adopting repo (e.g. `oncall-hub-api`). Adoption is **one prompt**
(`tasks fleet init`, an extension of the `one-prompt-setup` task).

## Why

Three failure modes:

1. **Best-effort claiming races.** `(@agent)` claims are visible only after a push, and
   `pickBestTask` is deterministic, so two agents on an identical file pick the *same*
   top task. `tasks claim` is a no-op (`packages/cli/src/backend/tasks-md.ts:84`) — no
   machine-safe claim primitive exists.
2. **Skills are probabilistic.** A `/next-task` skill *suggests* "claim before you work";
   it cannot *guarantee* it. An agent (or a human, or a different vendor's agent) can
   forget to claim, push work uncoordinated, or clobber the ledger. "Reliable in every
   repo" demands a **deterministic enforcement layer** — the feedback-loop principle:
   *linters/hooks enforce, instructions suggest.* Hence git hooks + branch protection +
   a CI required check, with the skill as the *how* and the hooks as the *guarantee*.
3. **Setup friction kills adoption.** If wiring the ledger ref, hooks, and CI is a manual
   checklist, teams will do it wrong or not at all. It must be one idempotent command.

Design choices (operator decision, task Research (f)/(g)/(h)): stay git-native (agents
are file-native); adopt the event-log model from `Nautilus git-queue` (optimistic lock
via commits) + the per-task-file idea from `zedutch/tq`, hardened so that **the winner of
a task is simply the first `claimed` event in the ref's commit order** — no timestamp
resolver, no merge driver, clock-skew-immune.

## Scope (in)

- `spec.md` new `## Fleet coordination`: the two-plane model; the ref layout / where the
  logs live and how they sync; the claim CAS; the deterministic fold; `@machine/agent`
  identity; the `.tasksmd.json` fields (`backend`, `claimsRef`, `leaseTtlSec`).
- The `git-claims` backend: append-only event store + fold + `git`-CAS append + snapshot
  compaction, behind the existing `TaskBackend` seam.
- **Enforcement layer (deterministic):** committed git hooks installed via
  `core.hooksPath` — `pre-push` (block a work push to `main` for a task this actor does
  not hold a live claim on), `post-merge`/`post-checkout` (auto-fetch the ledger),
  `prepare-commit-msg` (stamp the `Task: <id>` trailer); **branch protection** on the
  claims ref (no force-push / no delete); a **CI required check** that a PR to `main`
  references a live-claimed task; and the CI exclusion of the claims ref from the build.
- **One-prompt setup:** `tasks fleet init` (idempotent) — create the ledger ref, write
  `.tasksmd.json`, install hooks + set `core.hooksPath`, install the CI workflows,
  best-effort apply branch protection via `gh` (print the exact manual command when it
  needs admin), install the `/next-task` command variants — plus a `tasks fleet doctor`
  diagnostic. Extends `one-prompt-setup`.
- Tests: two-clone collision, append-only auto-merge, fold/`isClaimLive` units,
  reconciliation, `pre-push` rejects an unclaimed work push, and `tasks fleet init`
  idempotency.

## Scope (out)

- **Per-host coordinator daemon** (poll loop, batch pusher, local file-lock). Throughput
  optimization → `fleet-claim-coordinator-daemon`.
- **Heartbeat liveness** (per-machine force-pushed refs). v1 uses a lease only (no
  heartbeat). → `fleet-claim-heartbeat-liveness`.
- **HRW machine-partition** + **ref-sharding** + stale-claim **reaper**/compaction tuning.
  → `fleet-claim-hrw-partition`, `fleet-claim-ref-sharding`.
- **Server-side `pre-receive` enforcement** (the bypass-proof layer; GHE/self-hosted
  only). → `fleet-claim-server-enforcement`.
- **Server-queue backend** (pgmq/River) — the scale trip-wire fallback. →
  `fleet-claim-queue-backend`.
- The canonical setup *prompt/command text* lands in the `one-prompt-setup` task; this
  plan specifies the fleet-specific additions it must perform.

## Implementation steps

### Step 1: Spec the two-plane model + ref layout (where the logs live)

`spec.md` `## Fleet coordination`: `TASKS.md` on `main` = queue (Plane 1); an append-only
event log on a dedicated ref (`tasks-claims` branch by default; `refs/tasks/*` where the
host allows; or a sidecar repo for locked-down orgs) = claim ledger (Plane 2). Events are
immutable files `.tasks/events/<ulid>.json` `{v,type,task,owner,ts,lease_expires}` with
`type ∈ {claimed,released,completed,cancelled,snapshot}`. Sharing = ordinary
`git push`/`fetch` of that ref to the shared remote; the push IS the CAS. Document
`@machine/agent` identity and the `.tasksmd.json` fields. Verify:
`grep -c "Fleet coordination" spec.md` ≥ 1; `grep -c "leaseTtlSec" spec.md` ≥ 1;
`npx -y @tasks-md/lint TASKS.md` exits 0.

### Step 2: Backend selection plumbing

Add `git-claims` to `BackendKind` (`config.ts`), `isBackendKind`, the unknown-backend
error message, and the `createBackend` switch (`index.ts`). Verify:
`npm run build -w packages/cli`; a `config.test.ts` case asserts `git-claims` resolves and
an unknown value throws.

### Step 3: Event store + fold (pure, no git)

New module, pure functions: parse/serialize an event file; `fold(events) → Map<taskId,
ownerState>` where the owner of a task is the actor of the **first `claimed` event for
that task in log order**, unless a later `released`/`completed`/`cancelled` supersedes it;
`isClaimLive(state, now)` (lease not expired). **Log order** = position in
`git log --reverse` (topological + commit date); ties (equal date) are broken by commit
hash (lexicographic) — deterministic across clones, and no wall-clock comparison decides
the winner. A **`snapshot`** event
`{v, type:"snapshot", tasks:{<id>:{owner,lease_expires}}, snapshotAt:<commit>}` lets a fold
start mid-log: validate `git merge-base --is-ancestor <snapshotAt> HEAD`; if invalid or
missing, fall back to folding the whole log (slower, always correct). Verify: unit tests
for serialize/parse round-trip (events + snapshot), `fold` determinism (same events → same
owners), winner = first-claimed, tie-break by commit hash, snapshot validation +
fold-from-snapshot equals fold-from-zero, and `isClaimLive` boundaries
(`now <`/`==`/`>` `lease_expires`).

### Step 4: Git-CAS append (the core, highest-risk)

`appendEvent(event)`: operate the claims ref through a detached worktree (gitignored cache
path) or pure plumbing (`hash-object`/`commit-tree`/`update-ref`); write
`.tasks/events/<ulid>.json`; commit; `git push`. On non-ff rejection: `git fetch`; fold;
if claiming and a *live* `claimed` for the task already exists → return `{won:false}`;
else the event re-applies cleanly (unique filename, never a same-path conflict) → re-push.
Retries use **exponential backoff** (100ms initial, 5s cap, 10 max); on exhaustion return
`{won:false}` with `claim rejected: too many rebase conflicts`. A `snapshot` event
(written via the same CAS) compacts the log: it records live claims as of commit C; folds
start from the latest snapshot. Verify: the two-clone integration test (Acceptance #3/#4).

### Step 5: Wire the `TaskBackend` surface + reconciliation

`git-claims.ts`: `listOpen`/`next` rank via `pickBestTask` but drop tasks with a live
claim (fold of the ledger); a `claimed` event whose task is absent from `TASKS.md` is
ignored; an expired/absent claim → claimable. `claim(id)` calls `appendEvent(claimed)`;
`complete(id)` removes the `TASKS.md` block (work PR on `main`) **and** appends
`completed`; cancelling a task is `complete(id, {reason:"cancelled"})`, which removes the
block and appends `cancelled`. Orphaned claims (events for tasks no longer in `TASKS.md`
that nobody cancelled) are swept by a deferred `tasks fleet cleanup` — until then they are
simply ignored by the fold and expire by lease. Verify: end-to-end temp-repo test
(claim → next skips → complete → next returns it gone).

### Step 6: Enforcement layer (deterministic — the reliability mechanism)

- Commit hooks under `.tasks/hooks/` and have `tasks fleet init` set
  `git config core.hooksPath .tasks/hooks` so they travel with the repo and apply to
  every clone. If `core.hooksPath` is already set to something else, `tasks fleet init`
  backs the existing hooks up to `.tasks/hooks.bak/`, merges (chains the prior hook), and
  warns — it never silently clobbers another tool's hooks:
  - `pre-push`: for commits pushed to `main`, extract task id(s) from the `Task: <id>`
    trailer / `task/<id>` branch / `closes <id>` (require a live claim on ALL ids found;
    reject "task not found" if an id isn't in TASKS.md); fetch the (cached) ledger; if no
    live claim by this actor → reject with a fix-it message (or auto-claim if configured).
  - `post-merge` / `post-checkout`: `git fetch` the claims ref so the local fold is fresh.
  - `prepare-commit-msg`: stamp `Task: <id>` from the current claim/branch.
- A CI workflow (`.github/workflows/tasks-claim.yml`): (a) build/test workflows
  `paths-ignore` / branch-exclude the claims ref; (b) a **required check** that extracts
  the task id(s) from the PR (title / body / `task/<id>` branch / `Closes`), fetches the
  ledger, and asserts a live `claimed` event by `github.actor` (the merge trigger) for ≥1
  of them — failing with `PR author must own the claimed task (re-author or claim under
  your identity)` when the author isn't the owner. Required-before-merge (branch
  protection enforces ordering), and idempotent on re-run.
- Branch protection on the claims ref (no force-push, no delete) — server-side, portable
  to github.com, makes the append-only invariant bypass-proof.
Verify: a test drives `pre-push` and asserts it rejects an unclaimed work push and passes
a claimed one; a test asserts the build workflow does not trigger on the claims ref.

### Step 7: One-prompt setup (`tasks fleet init`)

Idempotent command/prompt that performs Steps 1–6's wiring in one shot: assert a git
remote + push access exist (else print a fix-it message); create the orphan ledger ref +
push; write `.tasksmd.json`; install `.tasks/hooks/*` + set `core.hooksPath` (with the
back-up/merge behaviour from Step 6); install the CI workflows; best-effort `gh api`
branch protection (print the exact manual command if it needs admin); install
`/next-task` variants. Re-running diffs current state and writes only what's missing
(no-op when already set up). A companion **`tasks fleet doctor`** diagnoses an adopting
repo — it checks: (1) `core.hooksPath` = `.tasks/hooks`; (2) the hooks exist and are
executable; (3) the ledger ref is reachable; (4) `.tasksmd.json` has `backend:
git-claims`; (5) the CI workflows are installed — exit 0 if all pass, 1 otherwise. Verify:
on a fresh temp repo, `tasks fleet init` → `git config core.hooksPath` returns
`.tasks/hooks` and `tasks fleet doctor` exits 0; a second `tasks fleet init` makes no
changes.

## Risks and mitigations

- **Risk: client hooks are bypassable (`--no-verify`) or not installed.** They're
  ergonomics, not the guarantee.
  - Mitigation: the hard guarantees are **server-side** and portable to github.com —
    branch protection (no force/delete on the ledger ref) + the required CI check
    (no merge to `main` without a live claim). `pre-receive` (strongest) is deferred to
    `fleet-claim-server-enforcement` where the host supports it. Client hooks are the
    fast local guardrail on top.
- **Risk: hooks don't reliably reach every clone.** `core.hooksPath` must be set per
  clone.
  - Mitigation: `tasks fleet init` sets it and commits the hooks; `tasks fleet doctor`
    checks it; the CI required check backstops any clone that skipped setup.
- **Risk: merge-loop / two-winners.** (The historical worry.)
  - Mitigation: the event log makes appends conflict-free (unique filenames) and the
    winner is *first-claimed-in-log-order* — no merge driver, no resolver. Covered by the
    two-clone collision test + a randomized-interleaving property test.
- **Risk: event-log growth.** Unbounded logs slow the fold.
  - Mitigation: heartbeats are NOT in the log (deferred to per-machine refs), so growth ∝
    task throughput (~2–4 events/task), not wall-clock; `snapshot` compaction truncates.
- **Risk: push-throughput / rate-limit ceiling.** Every claim is a serialized push.
  - Mitigation: minute-plus task workload keeps claim rates low; per-host batching +
    ref-sharding are deferred follow-ups; **trip-wire**: sustained claims > ~tens/min or
    fleet > ~tens of hosts → `fleet-claim-queue-backend`.
- **Risk: clock skew.** Lease expiry uses wall-clock.
  - Mitigation: the *winner* is log-order (skew-immune); only the *coarse* lease uses
    wall-clock → require NTP + minutes-granular `leaseTtlSec`.
- **Risk: setup needs admin (branch protection) — a human-blocked step.**
  - Mitigation: `tasks fleet init` does everything `gh` permits and prints the exact
    `gh api` / UI step for the rest; never silently half-configures.
- **Risk: ledger ↔ TASKS.md drift / orphaned events.**
  - Mitigation: read-time reconciliation in `next()`; `completed`/`cancelled` events;
    `snapshot` compaction drops events for absent tasks; lease makes stragglers inert.
- **Risk: ref portability / branch-protection-everywhere orgs.**
  - Mitigation: default to a plain `tasks-claims` branch; `tasks fleet init` probes for
    `refs/tasks/*`; a sidecar ledger repo is the escape hatch for locked-down code repos.
- **Risk: snapshot corruption or staleness.** A bad/incomplete snapshot makes the fold
  wrong.
  - Mitigation: validate the snapshot is reachable (`git merge-base --is-ancestor
    <snapshotAt> HEAD`) before trusting it; on any failure, fold the whole log from zero
    (slower, always correct). Snapshots are derived/rebuildable, never the source of truth.
- **Risk: event-format evolution.** A schema change could make older agents misread newer
  events.
  - Mitigation: the `v` schema-version field; readers tolerate unknown fields and treat an
    unreadable/newer-`v` event as opaque-but-LIVE (never silently ignore a claim);
    format-breaking changes require a major bump + migration window.
- **Risk: CI required-check race (PR merged before the check runs).**
  - Mitigation: the check is *required before merge* (branch protection enforces ordering
    on github.com) and idempotent on a given commit; a merge can't land until it's green.

## Acceptance criteria

1. Spec documents the two-plane model, the ref layout / transport, the enforcement layer,
   and the `.tasksmd.json` fields: `grep -c "Fleet coordination" spec.md` ≥ 1,
   `grep -c "leaseTtlSec" spec.md` ≥ 1, `npx -y @tasks-md/lint TASKS.md` exits 0.
2. `git-claims` backend selectable: `config.test.ts` proves it resolves + unknown throws;
   `npm test -w packages/cli` exits 0.
3. **Collision (core gate):** two clones append `claimed{X}` concurrently → exactly one is
   the first live claim in log order; the loser's `claim` returns `{won:false}`.
4. **Append auto-merge:** two clones append events for different tasks → both land, no
   manual conflict (unique filenames).
5. `fold` determinism + winner-is-first-claimed + tie-break-by-commit-hash + snapshot
   validation (fold-from-snapshot == fold-from-zero) + `isClaimLive` boundaries (unit tests).
6. `next()`/`listOpen()` reconcile: skip live-claimed; ignore claims for absent tasks;
   surface expired-claim tasks (backend test).
7. `complete(id)` removes the `TASKS.md` block AND appends `completed`; delete appends
   `cancelled` (end-to-end test).
8. **Enforcement:** a test drives the `pre-push` hook and asserts it rejects a work push
   for an unclaimed task and allows a claimed one; a test of the CI required-check logic
   rejects a PR with no live claim by the author and allows one with a claim; a test
   asserts the build CI workflow excludes the claims ref; `tasks fleet init` produces the
   branch-protection + required-check config.
9. **One-prompt setup:** on a fresh temp repo, `tasks fleet init` yields a working ledger
   ref + installed hooks (`git config core.hooksPath` returns `.tasks/hooks`) +
   `.tasksmd.json` (`backend: git-claims`) + CI workflows; a second run changes nothing
   (idempotent — `git config core.hooksPath` still `.tasks/hooks`); `tasks fleet doctor`
   exits 0.
10. Determinism preserved: existing `pickBestTask` tests pass unchanged
    (`npm test -w packages/parser` exits 0).
11. Full gate green: `npm run build && npm test && npm run lint` all exit 0.

## Reviewer verdict

- **Verdict**: approved (event-log redesign; second pass — first pass needs-revision, six concerns resolved)
- **Reviewer**: `reviewer` subagent (plan-validation profile)
- **Date**: 2026-06-02
- **Concerns**:
  - (none remaining — the six concerns of the redesigned plan were resolved: snapshot format + validation + fallback; deterministic log ordering with commit-hash tiebreak; the `cancelled` trigger via `complete(id,{reason})`; `tasks fleet doctor` defined with five checks; the CI required-check extraction + author-match logic; and hook-conflict backup/merge/warn — plus added risks for snapshot staleness, event-format evolution, and the CI-check race.)
- **Approval rationale**:
  - The event-log design (winner = first `claimed` event in commit order) is clock-skew-immune and merge-loop-free, and the enforcement layer is layered honestly — client hooks for ergonomics, server-side branch protection + a required CI check as the real bypass-proof guarantee, with `pre-receive` deferred. `tasks fleet init`/`doctor` make adoption one idempotent command with concrete acceptance checks, and the scope is appropriately tight for v1 with throughput optimizations and server-side enforcement deferred to named follow-ups.
