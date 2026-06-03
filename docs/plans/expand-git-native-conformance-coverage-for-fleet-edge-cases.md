# Plan: Expand conformance coverage for fleet edge cases

- **Task**: expand-git-native-conformance-coverage-for-fleet-edge-cases
- **Repo**: /Users/fivanishche/apps/tooling/tasks.md
- **Author**: devin session 2026-06-03
- **Status**: draft

## Goal

Strengthen the fleet edge-case coverage the task names — large-log fold, compaction-vs-claim race, clock skew on lease expiry, heartbeat under contention, and a stale owner's heartbeat after a steal — by putting **each** in the right suite, and closing the one genuine **cross-backend** gap: heartbeat has *zero* conformance coverage (the `ConformanceWorld` has no `heartbeat` method, even though `tasks heartbeat` shipped in #114).

## Why

The 10 conformance properties never exercise heartbeat. The cross-backend contract therefore doesn't pin the most safety-critical heartbeat behavior: a **resurrected owner whose lease was stolen must not be able to renew it**. That belongs in the shared suite so every lease-capable backend is held to it.

## Design decision: cross-backend contract vs implementation-specific test

The reference oracle (`InMemoryFleet`) models lease expiry as an explicit `expiredClaimIds` toggle (`expireLease`), **not a wall clock**. So properties that depend on real time or on git-native internals **cannot** be expressed against the reference and do **not** belong in `@tasks-md/conformance`:

| Scenario | Home | Status |
|---|---|---|
| Stale owner's heartbeat rejected after a steal | **conformance** (cross-backend, reference-expressible) | **NEW (this task)** |
| Live owner can heartbeat | **conformance** (same property) | **NEW (this task)** |
| Compaction racing a concurrent claim | git-native.test.ts (compaction is git-native-only) | already covered (#113 no-clobber) |
| Large-log fold | git-native.test.ts (the log is git-native-only) | already covered (#115 scale + O(1)) |
| Clock skew / non-monotonic lease expiry | git-native.test.ts (reference has no clock) | **NEW (this task)** |
| Heartbeat renews/extends the lease (timer) | git-native.test.ts (reference has no timer) | **NEW (this task)** |

## Scope (in)

1. **`@tasks-md/conformance`**: add optional `heartbeat?(actor, taskId, claimId?): Promise<ClaimOutcome>` to `ConformanceWorld`; implement it in the `InMemoryFleet` reference oracle (owner-of-live-claim + matching token → `claimed`; non-owner / stale token / expired → `conflict`); add a `heartbeat-fencing` check (`requires: ["leases"]`): claim → live owner heartbeats OK → `expireLease` → contender steals → original owner's heartbeat with the old token is **rejected**.
2. **git-native conformance test** (`git-native.conformance.test.ts`): implement `heartbeat` on `GitNativeWorld` (delegates to `backend.heartbeat`); add `heartbeat-fencing` to the must-run `arrayContaining` list.
3. **broken-stub** (`broken.ts` + `model.ts`): add a `noHeartbeatFencing?: boolean` flag to `ModelBugs`; when set, `InMemoryFleet.heartbeat` skips the owner/token check and always returns `claimed` (the violation — a stale owner is wrongly allowed to renew). Inject it in `brokenTarget`'s bugs and add `"heartbeat-fencing"` to `brokenExpectedFailures`, so the `conformance.test.ts` self-test proves the check *catches* the violation (without the flag the broken stub would vacuously pass, since `noCas`/`noEnforcement` don't touch heartbeat).

   **"Under contention"** here means a *competing claimer steals the lease* (the heartbeat-fencing scenario), which is the safety-critical case. The test world is single-threaded, so genuinely *concurrent* heartbeats aren't modeled — and don't need to be: collision-freedom is already proven by the CAS race checks, and the heartbeat contract is purely "only the live owner with the current token renews."
4. **git-native.test.ts** (implementation-specific, real clock): (a) **heartbeat renews the lease** — claim (lease T+L), advance clock < L, heartbeat, advance again past the *original* expiry but < renewed, assert still owned (a contender gets `already_claimed`); (b) **clock skew** — claim, move the clock *backward*, assert the lease is not spuriously expired (contender still blocked).

## Scope (out)

- Re-expressing compaction-race / large-log as conformance properties — they're git-native-only and already covered in `git-native.test.ts`; forcing them into the cross-backend suite would require backend-specific hooks that the reference can't model.
- A real clock in the reference oracle — out of scope; the `expiredClaimIds` toggle is sufficient for the cross-backend lease contract.
- New `tasks-md` work: the file backend has `leases: false`, so `heartbeat-fencing` skips there automatically (no change).

## Implementation steps

1. `types.ts`: add `heartbeat?` to `ConformanceWorld` (doc: requires `leases`).
2. `model.ts`: add `noHeartbeatFencing?` to `ModelBugs`; implement `InMemoryFleet.heartbeat`: fold, then `claimed` if `this.bugs.noHeartbeatFencing || (folded.owner === actor && !folded.leaseExpired && (!claimId || folded.claimId === claimId))`, else `conflict` (missing/closed → `missing`). No new event needed (renew is a no-op in the toggle model; the property only asserts accept/reject).
3. `checks.ts`: add the `heartbeat-fencing` check (`requires: ["leases"]`) per the design above.
4. `broken.ts`: inject `noHeartbeatFencing: true` in `brokenTarget` and add `"heartbeat-fencing"` to `brokenExpectedFailures`.
5. `git-native.conformance.test.ts`: add `GitNativeWorld.heartbeat` (delegates to `backend.heartbeat`) + add `"heartbeat-fencing"` to the must-run `arrayContaining`.
6. `git-native.test.ts`: add the renew + clock-skew tests (real clock via the injected `now`).
7. Verify: `npm run build && npm test && npm run lint` (incl. the conformance self-test asserting the broken target fails exactly `brokenExpectedFailures`).

## Risks and mitigations

- **Risk: the reference `heartbeat` disagrees with git-native** (oracle drift). Mitigation: both implement the same rule — owner-of-live-claim + matching token renews, everything else conflicts; the shared check runs against both and the in-memory reference + git-native must agree.
- **Risk: broken-stub miswiring** makes the check vacuous. Mitigation: the `noHeartbeatFencing` bug (step 2/4) makes the broken stub *allow* the stale renew, so it fails `heartbeat-fencing`; the `conformance.test.ts` self-test asserts the broken target fails *exactly* `brokenExpectedFailures`, catching both a vacuous check and an over-broad one.
- **Risk: scope creep** into a clock-bearing reference. Mitigation: explicitly out of scope; clock-dependent properties live in git-native.test.ts.

## Acceptance criteria

1. `ConformanceWorld` has optional `heartbeat?`; `InMemoryFleet` implements it; a `heartbeat-fencing` check exists (`requires: ["leases"]`).
2. git-native conformance run includes `heartbeat-fencing` in the must-run list and passes; tasks-md conformance still passes (it skips, `leases: false`).
3. The broken stub injects `noHeartbeatFencing` and `"heartbeat-fencing"` is in `brokenExpectedFailures`; the `conformance.test.ts` self-test (broken fails *exactly* its expected set) passes — proving the new check catches the violation and isn't over-broad.
4. `git-native.test.ts` gains a heartbeat-renews-lease test and a clock-skew (non-monotonic time) test, both passing.
5. `npm run build && npm test && npm run lint` all green.

## Reviewer verdict

<!-- Filled in by the reviewer subagent. -->
