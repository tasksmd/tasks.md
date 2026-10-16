# 0002. The git-native backend uses linear compare-and-swap on a git ref

- **Status**: accepted
- **Date**: 2026-06-02 (recorded 2026-10-16)
- **Sources**: [docs/research/gitbug-reuse-spike.md](../research/gitbug-reuse-spike.md) (bake-off result); [docs/plans/deterministic-fleet-claiming.md](../plans/deterministic-fleet-claiming.md); [spec.md § Fleet coordination](../../spec.md#fleet-coordination)

## Context

A fleet of agents on many machines must never hold the same task twice (G7).
The claim log has to live where agents already are, in git, and must need no
server.

## Decision

Claims are events appended to the `refs/heads/tasks-claims` ref. A push that is
not a fast-forward is rejected by git itself, so two concurrent claims cannot
both land: the loser re-fetches and yields. No CRDT engine is used in v1.

## Alternatives

- **git-bug** (deterministic merge of forked refs, confirmed in a two-clone
  experiment), **grite**, **git-warp**, Automerge or Yjs on git. A bake-off
  against the conformance suite found linear CAS meets the bar with 0 new
  runtime dependencies, while each engine adds a binary or library, a GPL
  boundary for some, and lease and snapshot shims they lack.
- **Beads**, **git-appraise**: failed the determinism bar.

## Consequences

- `git` is the only runtime dependency; the adapter is one file (`git-native.ts`).
- Contention costs a retry, not a merge; the log stays linear and easy to fold.
- The log grows without bound, so compaction exists (`tasks fleet compact`).
- The engine choice stays reversible behind the backend interface (0001).
