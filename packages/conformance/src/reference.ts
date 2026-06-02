// The reference target: a faithful in-memory implementation of the spec
// semantics. It MUST pass every check — it is the executable spec and the proof
// that the suite is satisfiable.

import { InMemoryFleet } from "./model.js";
import type { ConformanceTarget } from "./types.js";

export const referenceTarget: ConformanceTarget = {
  name: "in-memory-reference",
  capabilities: {
    collisionFree: true,
    leases: true,
    generatedSnapshot: true,
    pathScopedEnforcement: true,
    rawEventAppend: true,
    blockedBy: true,
  },
  createWorld: () => new InMemoryFleet(),
};
