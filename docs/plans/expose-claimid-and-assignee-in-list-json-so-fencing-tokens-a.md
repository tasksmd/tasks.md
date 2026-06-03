# Plan: Expose claimId (owner-gated) + leaseExpiresAt in list --json

- **Task**: expose-claimid-and-assignee-in-list-json-so-fencing-tokens-a
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft

## Goal

Let a git-native owner retrieve **their own** fencing token from `tasks list --json` so they can pass it to `heartbeat`/`complete --claim`/work-push trailers — without re-deriving it from `git log`. Also surface `leaseExpiresAt` (non-sensitive) so stale claims are visible.

## Why

`claim` prints the `claim_id` once; nothing else returns it. A **migrated** owner never even ran `claim` (the migration created the claim), so they have no way to obtain their token — which blocks fencing their own pushes once enforcement is armed (the `migrated-owners-can-t-retrieve-their-random-fencing-token` follow-up, and a prerequisite for arming enforcement on a migrated repo). `assignee` is already serialized (it's on `BackendTask`); the gap is `claimId` + `leaseExpiresAt`, which live on `FoldedTask` and are dropped by `sortedTasks`.

## Scope (in)

- Add `claimId?: string` and `leaseExpiresAt?: number` to `BackendTask` (`backend/types.ts`).
- Populate both in git-native `sortedTasks` from the fold entry (`entry.claimId` / `entry.leaseExpiresAt`).
- `tasks list`: add a read-only `--as <actor>` option (defaults to `$TASKS_ACTOR`). In the `--json` output, include `claimId` **only** for tasks whose `assignee` matches the resolved actor; **redact** (`undefined`) it for every other task, and redact **all** `claimId`s when no actor resolves. `leaseExpiresAt` + `assignee` are shown for all (not capabilities).

## Scope (out)

- Broadcasting every task's `claimId` to all callers — explicitly rejected (see Risks): the token *gates work* (threat-model B2/B5), so the convenience API must not hand non-owners a ready-to-use forgery token, even though it is git-log-readable.
- File / github-issues backends: they have no lease/`claimId`; `claimId`/`leaseExpiresAt` stay `undefined` there (no behavior change). `assignee` already works.
- A dedicated `tasks whoami`/`claim-token` command — `list --json` is the requested surface.

## Implementation steps

1. `backend/types.ts`: add `claimId?` + `leaseExpiresAt?` to `BackendTask` with doc comments (git-native only).
2. `backend/git-native.ts` `sortedTasks`: map each entry to `{ ...entry.task, claimId: entry.claimId, leaseExpiresAt: entry.leaseExpiresAt }`.
3. `cli.ts` `list`: add `--as <actor>`; in the `opts.json` branch of the non-`tasks-md` path, map tasks through an owner-gate that strips `claimId` unless `normalizeActor(opts.as ?? $TASKS_ACTOR) === normalizeActor(task.assignee)`. Reuse the same `@`-stripping normalization the backend's `actor()` uses (extract a tiny shared helper if needed, else inline a `replace(/^@/, "")`).
4. Tests (cli.test.ts e2e on a git-native repo): (a) owner `list --as @me --json` shows their `claimId`; (b) a **different** `--as @other` (or no `--as`) redacts it; (c) `leaseExpiresAt` + `assignee` are present regardless; (d) file-backend `list --json` is unaffected.

## Risks and mitigations

- **Risk: leaking a work-gating capability.** Broadcasting `claimId` would let any caller forge a work-push for another agent's task. Mitigation: owner-gated redaction (the core design); document that the token is already git-log-readable so this is convenience, not new exposure, while still not trivializing forgery via the API. Keep `arm-hard-claim-enforcement`'s threat model consistent.
- **Risk: actor-normalization mismatch** (`@me` vs `me`) hides the owner's own token. Mitigation: reuse the backend's exact normalization; test the `@`-prefixed and bare forms.
- **Risk: type change ripples to other `BackendTask` producers.** Mitigation: the fields are optional (`?`), so file/github producers compile unchanged; `npm run build` verifies.

## Acceptance criteria

1. `BackendTask` has optional `claimId` + `leaseExpiresAt`; `git-native` `sortedTasks` populates them.
2. `tasks list --as <owner> --json` includes `claimId` for the owner's claimed tasks; `--as <non-owner>` and no-`--as` omit it.
3. `leaseExpiresAt` and `assignee` are present for claimed tasks regardless of `--as`.
4. File-backend `list --json` is unchanged (no `claimId`/`leaseExpiresAt`).
5. `npm run build && npm test && npm run lint` all green, with new cli e2e tests for the owner-gate.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->
