# Plan: Expose claimId (owner-gated) + leaseExpiresAt in list --json

- **Task**: expose-claimid-and-assignee-in-list-json-so-fencing-tokens-a
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft

## Goal

Let a git-native owner retrieve **their own** fencing token from `tasks list --json` so they can pass it to `heartbeat`/`complete --claim`/work-push trailers — without re-deriving it from `git log`. Also surface `leaseExpiresAt` (non-sensitive) so stale claims are visible.

## Why

`claim` prints the `claim_id` once; nothing else returns it. A **migrated** owner never even ran `claim` (the migration created the claim), so they have no way to obtain their token — which blocks fencing their own pushes once enforcement is armed (the `migrated-owners-can-t-retrieve-their-random-fencing-token` follow-up, and a prerequisite for arming enforcement on a migrated repo). `assignee` is already serialized (it's on `BackendTask`); the gap is `claimId` + `leaseExpiresAt`, which live on `FoldedTask` and are dropped by `sortedTasks`.

## Design decision: broadcast, don't owner-gate (reviewer-driven)

Cycle 1 proposed gating `claimId` to the querying owner via `--as`. The reviewer **rejected** it as security theater: `actor-id` is *advisory/unsigned* in v1 (threat-model line 38), so `--as @victim` is forgeable — the gate provides **zero** real protection. The honest design (reviewer's recommendation) is to **expose `claimId` unconditionally** and be precise about what it is:

- The `claim_id` is **already git-log-readable** — anyone with repo access can extract every token from `refs/heads/tasks-claims`. `list --json` adds **no new exposure**, only convenience over `git show`.
- The fencing token is **not a secret capability**. Its job is *staleness detection* (a lapsed/replaced token no longer matches the live claim) and the **server-side required check** (B5/B7, Phase 3) is the real gate — not the read API.
- #117 (random migrated token) raised the floor to "must have repo/state access to obtain a token"; unconditional `list --json` exposure respects that floor (you run it *in* the repo). Owner-gating on a forgeable flag adds nothing above it.

## Scope (in)

- Add `claimId?: string` and `leaseExpiresAt?: number` to `BackendTask` (`backend/types.ts`), documented as git-native-only and **not secret** (git-log-readable).
- Populate both in git-native `sortedTasks` from the fold entry. The `list` command already `JSON.stringify`s the full `BackendTask`, so they flow through with **no `cli.ts` change**.
- A one-line clarification in `docs/security/git-native-claims-threat-model.md`: `claim_id` is log-readable; `list --json` surfaces it as convenience; the gate is the server-side check + staleness, not token secrecy.

## Scope (out)

- Owner-gating / `--as` on `list` / `claimId` redaction — rejected above (forgeable gate, false secrecy).
- File / github-issues backends: no lease/`claimId`; both stay `undefined` there (no behavior change). `assignee` already works.
- A dedicated `tasks whoami`/`claim-token` command — `list --json` is the requested surface.

## Implementation steps

1. `backend/types.ts`: add `claimId?` + `leaseExpiresAt?` to `BackendTask` with doc comments (git-native only; not secret — git-log-readable).
2. `backend/git-native.ts` `sortedTasks`: map each entry to `{ ...entry.task, claimId: entry.claimId, leaseExpiresAt: entry.leaseExpiresAt }`.
3. `docs/security/git-native-claims-threat-model.md`: add the log-readable / convenience / server-side-gate clarification.
4. Tests (cli.test.ts e2e on a git-native repo): (a) `list --json` on a claimed task shows `claimId` + `leaseExpiresAt` + `assignee`; (b) an unclaimed task has no `claimId`; (c) file-backend `list --json` is unaffected (no `claimId`).

## Risks and mitigations

- **Risk: implying the token is now "exposed" where it wasn't.** It was always git-log-readable; mitigate by documenting that explicitly (threat-model note + type comment) so nobody mistakes the read API for a security boundary.
- **Risk: type change ripples to other `BackendTask` producers.** The fields are optional (`?`), so file/github producers compile unchanged; `npm run build` verifies.
- **Risk: undercutting #117.** It doesn't — #117 stopped *deriving* a token from the public id with zero access; this still requires repo access, which already reveals the log.

## Acceptance criteria

1. `BackendTask` has optional `claimId` + `leaseExpiresAt`; `git-native` `sortedTasks` populates them; no `cli.ts` redaction logic.
2. `tasks list --json` on a git-native repo includes `claimId` + `leaseExpiresAt` for a claimed task (and `assignee`, as before).
3. An unclaimed task has no `claimId`; file-backend `list --json` is unchanged (no `claimId`/`leaseExpiresAt`).
4. The threat-model doc states `claim_id` is git-log-readable and the API is convenience, not a security boundary.
5. `npm run build && npm test && npm run lint` all green, with a new cli e2e test.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->
