# Spike: git-bug reuse mechanism for the claim ledger

> Resolves the open spike `fleet-claim-gitbug-reuse-spike` from
> [`docs/plans/deterministic-fleet-claiming.md`](../plans/deterministic-fleet-claiming.md).
> Date: 2026-06-02. Throwaway experiment code ran in a scratch dir and was discarded; this
> is the result. Lens: GET, don't IMPLEMENT (VISION G6).

## Question

The operator chose "reuse git-bug, don't reimplement" but was unsure *how*. This spike
resolves: (1) does git-bug actually give **deterministic cross-clone claim resolution**;
(2) which reuse mechanism — binary shell-out / Go library / upstream contribution; and
(3) is git-bug even the best reuse target vs. MIT alternatives?

## Headline: git-bug converges deterministically — empirically confirmed ✅

A real two-clone experiment (git-bug **v0.10.1**, installed via Homebrew):

1. Clone A created one entity (`refs/bugs/<hash>`) and pushed.
2. Clone B pulled it.
3. **Concurrently, without pulling each other**, A and B each made a non-commutative edit
   (title → `claim:owner-A` vs `claim:owner-B`).
4. A pushed (fast-forward); B's push was **rejected** (non-ff) → B pulled (merged) → pushed;
   A pulled.

Observed:

- The ledger ref **forked and merged** — the DAG showed two concurrent branches plus a
  merge commit. **git-bug does not require a linear ref; its fold resolves concurrent
  merges.**
- **Both clones folded to the same winner** (`claim:owner-A`), and an **independent fresh
  re-clone folded to the same winner** → deterministic across clones.

This is exactly the "deterministic winner under true concurrency" primitive the research
[`fleet-claiming.md`](./fleet-claiming.md) §1 flagged as required (git's *commit* order is
non-deterministic; git-bug instead orders operations by a **Lamport clock + lexicographic
tiebreak**, per its data-model design doc). **git-bug provides it out of the box — we do
not build the ordering, and we do not need to force a linear ledger** (a simplification
over the plan's earlier rebase-only defense-in-depth).

## Mechanism findings

- **CLI exposes only `bug` / `label` / `user`** — there is **no custom-entity command**.
  So pure binary shell-out cannot create a first-class `claim` entity; it would model a
  claim *as a bug* + a non-commutative op (semantically hacky, fragile output parsing).
- **`entity/dag` IS an importable Go library** (`github.com/git-bug/git-bug/entity/dag`,
  not `internal/`), with a documented custom-entity example — a `Claim`/`Lease` entity is
  ~200–300 LOC of Go. But git-bug is **GPL-3.0**.
- **License boundary:** invoking a GPL **binary** as a subprocess is *aggregation* (no
  obligation on the caller); **importing** the GPL Go package makes the importing binary
  GPL.
- **git-bug LACKS TTL leases and snapshot compaction** — both of which the claim ledger
  needs. They'd be added in the adapter (a small build, or borrowed from elsewhere).

## Reuse-mechanism recommendation

**v1: git-bug via a separate, GPL-licensed Go helper invoked as a subprocess.**

- The helper imports `entity/dag`, defines a first-class `Claim`/`Lease` entity (proven
  deterministic above), and ships as its own GPL binary; tasks.md's TS packages call it via
  `exec` (aggregation → the TS packages stay MIT). Clean semantics **and** a clean license
  boundary — at the cost of a Go build and a shipped binary.
- Quicker-but-hackier fallback: pure-CLI shell-out modeling claims as bugs (no Go helper,
  but claims aren't first-class and CLI parsing is brittle).
- Build only the thin **lease-expiry + snapshot** logic in the adapter (git-bug's gap).
- Keep it behind the adapter interface so the engine is swappable (below).

## Honest caveat: git-bug may not be the *most complete* reuse target

The alternatives scan (cited in [`fleet-claiming.md`](./fleet-claiming.md)) shows git-bug
is the most battle-tested but not the only — or most feature-complete — option:

| Engine | License | Determinism | TTL leases | Snapshots | Maturity | Reuse surface |
|---|---|---|---|---|---|---|
| **git-bug** | GPL-3.0 | ✅ Lamport (**proven here**) | ❌ build it | ❌ build it | ✅ ~9.7k★, since 2018 | binary (bugs only) / Go lib |
| **grite** | MIT | ✅ Lamport CRDT | ✅ **native** | ✅ **native** | ⚠️ new, ~2 contributors | binary / Rust lib |
| **git-warp** | MIT | ✅ Lamport | ❌ build it | ✅ native | ⚠️ ~0★, 1–2 contributors | **TS / npm (direct import)** |
| **Beads** | MIT | ❌ hash-based (fails ≥5 clones) | ❌ | ❌ | ~1k★ (Yegge) | binary (`bd claim` built-in) |
| **git-appraise** | Apache-2.0 | ❌ `cat_sort_uniq` | ❌ | ❌ | ❌ stale (2021) | binary |

- **grite** natively covers **leases + snapshots** — exactly git-bug's gaps — and is MIT
  (no GPL friction), but is immature.
- **git-warp** is TS-native (zero subprocess/GPL cost, lowest integration cost) but
  graph-oriented and immature.
- **Beads** and **git-appraise** fail the determinism bar → ruled out.

## Decision needed (the spike surfaced a fork)

The empirical question is settled (git-bug works). But the evidence complicates "just
git-bug," so the engine choice is a real decision:

- **Option A — honor the steer:** git-bug v1 via the GPL Go helper subprocess; keep grite
  as a watch-and-swap candidate (cheap to swap behind the adapter interface). Most proven,
  but GPL + we build lease/snapshot.
- **Option B — follow the evidence:** adopt **grite** (native leases + snapshots, MIT) and
  accept its immaturity — or **git-warp** for TS-nativeness.
- **Parallel either way:** open an upstream CONTRIBUTE issue proposing a `claim`/`lease`
  entity to git-bug — the ideal end-state, non-blocking, but uncertain (its Board entity
  has been WIP for years).

Whichever engine wins, the adapter targets an interface, so the choice stays reversible.
