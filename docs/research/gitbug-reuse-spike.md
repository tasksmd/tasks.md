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

## Gap-audit update: linear-CAS is the v1 default

Follow-up review found that git-bug/CRDT machinery is useful but not required for the v1
guarantee if a strictly linear `tasks-claims` branch passes conformance. The current plan is
therefore:

1. Run a linear-CAS adapter against the conformance suite first.
2. Ship linear-CAS as v1 if it passes and contention stays below the Phase-4 tripwire.
3. Reuse git-bug, grite, Automerge-on-git, or another CRDT engine only if linear-CAS fails
   conformance or measured contention justifies the dependency.

The empirical git-bug result remains valuable as the fallback CRDT baseline, not as a
mandatory v1 implementation choice.

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

## Reuse-mechanism recommendation if CRDT is needed

If the conformance/metrics gate proves that linear-CAS is insufficient, the strongest
git-bug reuse mechanism is a separate, GPL-licensed Go helper invoked as a subprocess.

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

## Decision (operator review, 2026-06-02)

The empirical question is settled (git-bug works). The evidence complicates "just
git-bug," so rather than lock an engine now:

- **Engine choice is DEFERRED** — kept behind the adapter interface and chosen at
  implementation time by **prototyping the top candidates against the conformance suite**
  (plan Step 2). git-bug is the proven baseline; grite/git-warp are MIT alternatives that
  cover more natively.
- **Broaden the candidate set first** (operator directive) — see the expanded matrix below;
  notably **Radicle Collaborative Objects**, a generic CRDT-on-git-refs framework.
- **Upstream contribution: not now** — revisit once an engine is chosen and the adapter
  exists.

The adapter targets an interface, so the eventual choice stays reversible.

## Expanded candidate sweep (broadening beyond the first five)

_Researched 2026-06-02 per the operator's "research other tools" directive (~15 tools
swept). Two reuse families emerged._

**Family 1 — full git-native ledger engines** (append-only on git + deterministic order;
some add claims/leases):

| Engine | Determinism | TTL leases | Snapshots | Reuse surface | Lang | License | Maturity |
|---|---|---|---|---|---|---|---|
| **git-bug** | ✅ Lamport (proven here) | ❌ build it | ❌ build it | binary (bugs only) / Go lib | Go | GPL-3.0 | ✅ mature (since 2018) |
| **grite** | ✅ CRDT (LWW+sets) | ✅ **native** | ✅ **native** | binary / Rust lib | Rust | MIT | ⚠️ new (2026) |
| **Beads** | ⚠️ Dolt cell-merge (not a CRDT) | ❌ | ✅ compaction | binary + `@beads/bd` npm wrapper | Go | MIT | ✅ active, but **Dolt-backed (not pure git)** |

**Family 2 — CRDT cores** (deterministic merge engine; you add the git-storage + claim/lease
layer yourself — the approach Radicle takes wrapping Automerge):

| Core | Determinism | Reuse surface | Lang | License | Maturity | Note |
|---|---|---|---|---|---|---|
| **Automerge** | ✅ (formally verified SEC) | npm / Rust / WASM | TS+Rust | MIT | ✅ mature (v3) | no git storage, no leases — add a thin layer |
| **Yjs** | ✅ (version vectors) | npm | TS | MIT | ✅ huge (~4.8M dl/wk) | same as Automerge |
| **git-warp** | ✅ Lamport (OR-Set+LWW) | npm / JSR (direct import) | TS | MIT | ⚠️ immature | **already git-native**; no leases |

**Ruled out / not GitHub-reusable:**

- **Radicle Collaborative Objects** — a generic CRDT-on-git-refs framework (Automerge-based,
  `refs/cobs/<type>/<id>`, MIT/Apache, mature, custom types via `rad cob`). **Disqualified
  for our use case:** it hard-requires the Radicle P2P network / a running node + git
  namespaces and **cannot sync via plain `git push` to GitHub** (`git-remote-rad` uses
  `rad://`; the `radicle-sync` GH Action is deprecated precisely because the protocol
  doesn't work over GitHub). Excellent *if* we ever go Radicle-native — a different
  architecture. (RFC 0662; heartwood v1.7.0, 2026-03.)
- **sit** (dead since 2018), **ipfs-log** (archived 2023), **ticgit-ng** (stale) — unmaintained.
- **OrbitDB** (IPFS-dependent), **Fossil** (not git; C/SQLite) — wrong substrate.
- **git-issue** (dspinellis), **git-native-issue** — deterministic 3-way-merge *rules* but
  shell-only, no reusable lib → useful as a **format** reference, not an engine.

**Prototype shortlist for the deferred, conformance-suite-driven decision:**

1. **git-bug** — proven baseline (convergence empirically confirmed above); GPL via a
   subprocess helper; we build the thin lease/snapshot layer.
2. **grite** — best *single* fit (native leases + snapshots, MIT); immaturity is the risk.
3. **Automerge-on-git** (thin DIY layer) — mature, formally-verified CRDT + TS-native +
   full control of claim/lease/snapshot; the Radicle pattern minus the P2P lock-in.
   (**git-warp** is the already-git-native TS variant of this idea.)

**Net:** no single tool has all the properties we want. The real fork is *"adopt a fuller
engine and accept its gaps (git-bug / grite)"* vs. *"adopt a proven CRDT core and own the
thin git + lease layer (Automerge / git-warp)."* The conformance suite (plan Step 2) is the
decider — which is exactly why the engine choice is deferred behind the adapter interface.

URLs: git-bug <https://github.com/git-bug/git-bug>; grite <https://github.com/neul-labs/grite>;
Beads <https://github.com/gastownhall/beads>; Automerge <https://automerge.org>;
Yjs <https://github.com/yjs/yjs>; git-warp <https://github.com/git-stunts/git-warp>;
Radicle COB RFC 0662 <https://github.com/radicle-dev/radicle-link/blob/master/docs/rfc/0662-collaborative-objects.adoc>.

## Bake-off RESULT — linear-CAS wins v1; no CRDT engine adopted (`git-native-engine-bakeoff`)

The conformance suite is now real (`@tasks-md/conformance`) and the git-native backend
(`packages/cli/src/backend/git-native.ts`) was run against it
(`packages/cli/src/backend/git-native.conformance.test.ts`). **Decision: ship v1 on
linear-CAS with NO CRDT engine.** Evidence, not preference:

| Dimension | Linear-CAS (git ref non-ff rejection) | A CRDT engine (git-bug / grite / Automerge-on-git) |
|---|---|---|
| New runtime dependencies | **0** — `git` is already required | a Go binary (git-bug/grite, GPL boundary) or a CRDT lib (Automerge/Yjs) |
| Adapter LOC | the existing ~590-line `git-native.ts` | that + an engine integration layer + lease/snapshot shims the engines lack |
| Licence constraints | none | git-bug/grite are GPL-3.0 (shell-out boundary only); Automerge is MIT |
| Conformance result | **6/6 applicable checks pass** (same/different-task race, stale-snapshot, human-command path, release/reclaim, idempotent projection) | not prototyped — the trigger to do so never fired |
| Contention behaviour | optimistic CAS + silent retry on non-ff; fine at v1 scale (~tens of machines, long tasks) | only justified if measured contention crosses the Phase-4 tripwire (`fleet-phase4-contention-observability`) |

The bug-hunt value was immediate: the suite **caught a real defect** — `complete`/`release`/
`cancel`/`update` appended an event without fetching the claims ref first, so on a fresh
clone (which has only `refs/remotes/origin/tasks-claims`) they created an orphan commit that
the remote non-ff-rejected. Fixed by fetching before append.

**Skipped checks are honest v1 gaps, not failures:** `lease-expiry` (Phase 2),
`claim-fencing` + `path-scoped-enforcement` (Phase 3), `canonical-serialization` (raw-event
injection not exposed), `blocked-by` (not yet modelled in the fold). Each maps to a queued
follow-up. A CRDT engine is reconsidered ONLY when conformance fails or
`fleet-phase4-contention-observability` reports contention past the tripwire — and even then
it must be REUSED (git-bug via subprocess, or Automerge), never reimplemented.

### Observability + the quarterly Replace?/Relocate? check (shipped)

The reuse decision is now backed by a measurement, not a vibe: `tasks fleet stats`
(`gitNativeFleetStats` in `packages/cli/src/backend/git-native.ts`) folds the log into a
**contention ratio** and prints whether the repo is above or below the 20% Phase-4 tripwire
(`CONTENTION_TRIPWIRE`). No Phase-4 CRDT/HRW work may start until that number crosses the
line or an operator writes an override.

**Replace? Relocate? (revisit quarterly):** re-run this matrix each quarter. Has an upstream
engine become a drop-in that beats the zero-dependency linear-CAS adapter — e.g. git-bug
exposing a stable claim/lease API, or Automerge-on-git shipping a git-ref transport? If yes,
the adapter interface (`TaskBackend`) makes the swap a single-file change; if the contention
ratio is still &lt; 20%, the answer stays "no engine — relocate nothing." Last reviewed:
2026-06 (bake-off). Next review: 2026-09.
