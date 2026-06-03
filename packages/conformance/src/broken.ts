// A deliberately-broken target: the reference model with three specific bugs
// injected. It exists so the suite proves it has teeth — it MUST fail exactly
// the checks those bugs break, and pass the rest. If a future refactor lets the
// broken target pass a check it should fail, the suite has regressed into a
// rubber stamp.

import { InMemoryFleet } from "./model.js";
import type { ConformanceTarget } from "./types.js";

/** Checks the broken target is expected to fail (and only these). */
export const brokenExpectedFailures = [
  "same-task-race", // noCas → both claimers win
  "lease-expiry-and-steal", // noCas → the contender is never blocked
  "claim-fencing", // noEnforcement → wrong/absent tokens are allowed
  "idempotent-projection", // nonIdempotentRender → bytes differ each render
  "path-scoped-enforcement", // noEnforcement → code-in-docs is allowed
  "heartbeat-fencing", // noHeartbeatFencing → a stale owner is allowed to renew
];

export const brokenTarget: ConformanceTarget = {
  name: "broken-stub",
  capabilities: {
    collisionFree: true,
    leases: true,
    generatedSnapshot: true,
    pathScopedEnforcement: true,
    rawEventAppend: true,
    blockedBy: true,
    mutableUpdate: true,
  },
  createWorld: () =>
    new InMemoryFleet({
      noCas: true,
      nonIdempotentRender: true,
      noEnforcement: true,
      noHeartbeatFencing: true,
    }),
};
