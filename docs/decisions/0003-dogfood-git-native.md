# 0003. This repo runs its own queue on the git-native backend

- **Status**: accepted
- **Date**: 2026-06-02 (recorded 2026-10-16)
- **Sources**: [VISION.md](../../VISION.md) G8; [docs/plans/dogfood-git-native-migration.md](../plans/dogfood-git-native-migration.md); [docs/editing-rules.md § Task Queue Policy](../editing-rules.md#task-queue-policy)

## Context

The git-native backend is the recommendation for any repo with more than one
writer. A recommendation the maintainers will not run on their own
multi-writer repo is not credible, and its migration path is not proven.

## Decision

This repo converted its queue with the same `/migrate` path consumers run
(`tasks migrate --apply`, then `tasks fleet init`). `TASKS.md` here is a
generated snapshot of the `tasks-claims` log; it is never hand-edited. Code
changes need `Task:` and `Task-Claim:` trailers, checked by the required
`claim-check` workflow (`TASKS_CLAIM_ENFORCE=1`).

## Alternatives

- **Stay on the file backend here.** Zero setup, but it would leave the
  recommended path untested by its own authors.
- **Use GitHub Issues.** Proves a different backend, not the recommended one.

## Consequences

- Bugs in migration, claims, and the claim check surface here first (for
  example, the trailer-parsing trap in [docs/learnings.md](../learnings.md)).
- Contributors must use the CLI to file and finish tasks; `AGENTS.md` says so.
- `main`'s `TASKS.md` is a convenience copy with no freshness promise; the
  log is the truth (see `decide-projection-to-main-snapshot-freshness`).
