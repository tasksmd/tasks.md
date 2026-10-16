# 0001. Task storage is a pluggable backend behind one surface

- **Status**: accepted
- **Date**: 2026-06-02 (recorded 2026-10-16)
- **Sources**: [VISION.md](../../VISION.md) G4, G5, G6; [spec.md § Task backends](../../spec.md#task-backends)

## Context

A local `TASKS.md` is the right queue for one writer. It is the wrong one for a
team already in an issue tracker, and for many agents claiming at once. Moving
the work into another tool would break the promise that switching agents or
storage is configuration, never migration (G4).

## Decision

The spec, parser, CLI, and MCP server talk to one backend interface
(`TaskBackend` in `packages/cli/src/backend/`). `tasks-md` (the file) is the
default and the reference. `github-issues` and `git-native` are opt-in through
`.tasksmd.json` or `--backend`. Every backend must pass the conformance suite
(`@tasks-md/conformance`).

## Alternatives

- **File only.** Simplest, but two writers collide and teams in trackers stay out.
- **Build a coordination server.** Rejected by G6: leases, locking, and
  scheduling are solved problems; tasks.md delegates them.

## Consequences

- Switching storage is a one-line config change; `tasks migrate` moves a queue.
- Each new backend costs an adapter plus a conformance run, not a spec change.
- Some features (generated snapshots, leases) exist only where a backend
  supports them; `capabilities` in each result says which.
