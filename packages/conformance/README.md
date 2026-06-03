# @tasks-md/conformance

The backend conformance suite for [TASKS.md](https://github.com/tasksmd/tasks.md). It proves that a task backend implements the fleet semantics defined in [`spec.md` § Fleet coordination](../../spec.md#fleet-coordination) and [§ Agent-mediated task operations](../../spec.md#agent-mediated-task-operations) — without copying any backend's internal tests.

> **Stability.** The suite stayed internal until real adapters exercised the contract: the in-memory **reference** (`referenceTarget`), the **file backend** (`tasks-md`), and the **git-native** backend all run it in CI today, so the contract is stable enough to self-certify against. The **GitHub Issues** backend is operation-compatible — its create/claim/complete are covered by mocked `gh` tests ([`packages/cli/src/backend/github-issues.test.ts`](../cli/src/backend/github-issues.test.ts)) and it inherits collision-free claiming from GitHub's server-side issue-assignee atomicity — but a *live* conformance run requires `gh` auth + a real repo, so it runs as an integration check outside this unit suite rather than against a temp fixture.

## What "passes conformance" means — and what it does not

Conformance is **capability-scoped**, not pass/fail-monolithic. A check that needs a capability a backend does not declare is **skipped**, not failed. So three honestly-different compatibility levels exist:

1. **File compatibility** — the backend reads/writes the `TASKS.md` *format* (validated by [`@tasks-md/lint`](../lint/), not this suite).
2. **Operation compatibility** — the backend performs the [agent-mediated operations](../../spec.md#agent-mediated-task-operations) (`create`/`claim`/`release`/`complete`/`render`, optionally `update`). Lifecycle checks like `release-and-reclaim` prove this.
3. **Collision-free compatibility** — two agents never both hold the same task; claims carry fencing tokens; the snapshot is a byte-idempotent projection. The `same-task-race`, `claim-fencing`, `lease-expiry-and-steal`, and `idempotent-projection` checks prove this. **This is the property the file backend does NOT have** (its `(@agent)` claim is best-effort).

"Passes tasks.md conformance" therefore means *"every check the backend's declared capabilities require passed"* — always cite the capability set. It does **not** mean every check ran, and it does not certify performance, security, or the format itself.

## Capability classes

A `ConformanceTarget` declares a `ConformanceCapabilities` set; each gates a class of checks:

| Capability | Gated checks | A backend sets it true when… |
|---|---|---|
| `collisionFree` | `same-task-race`, `different-task-race` | concurrent claims resolve to exactly one winner (e.g. git ref-CAS) |
| `generatedSnapshot` | `stale-snapshot`, `idempotent-projection` | `TASKS.md` is a generated, byte-idempotent projection of a log |
| `leases` | `lease-expiry-and-steal` | claims carry an expiring lease a new owner can steal with a fresh token |
| `pathScopedEnforcement` | `claim-fencing`, `path-scoped-enforcement` | it can decide a work push by path + fencing token |
| `rawEventAppend` | `canonical-serialization` | raw events can be injected (duplicate/reordered/malformed ignored) |
| `blockedBy` | `blocked-by-unclaimable` | `blocked-by` tasks are unclaimable until blockers close |
| `mutableUpdate` | `human-command-path` | `update` programmatically patches a task (false for human-edited files) |

`release-and-reclaim` has no capability gate — every operation-compatible backend must pass it.

## Run it against your backend

Implement a `ConformanceTarget` — a `createWorld()` that returns a `ConformanceWorld` (the operation surface) plus the capability set — then run the suite. No need to read the suite's source:

```ts
import { runConformance, summarizeReport, failed, type ConformanceTarget } from "@tasks-md/conformance";

const target: ConformanceTarget = {
  name: "my-backend",
  capabilities: {
    collisionFree: true, generatedSnapshot: true, leases: false,
    pathScopedEnforcement: false, rawEventAppend: false, blockedBy: false,
    mutableUpdate: true,
  },
  createWorld: () => new MyWorld(), // implements ConformanceWorld
};

const report = await runConformance(target);
if (failed(report).length > 0) {
  console.error(JSON.stringify(summarizeReport(report), null, 2));
  process.exit(1);
}
```

Reference implementations to copy the shape from:

- **Sample (passes everything):** [`src/reference.ts`](src/reference.ts) + [`src/model.ts`](src/model.ts) — the in-memory `InMemoryFleet`.
- **Broken (shows failure output):** [`src/broken.ts`](src/broken.ts) — the same model with `noCas` / `nonIdempotentRender` toggles, so you can see exactly what a failing `same-task-race` or `idempotent-projection` looks like (`brokenExpectedFailures` lists them).
- **Real git backend:** [`packages/cli/src/backend/git-native.conformance.test.ts`](../cli/src/backend/git-native.conformance.test.ts) — drives the git-native backend across real clones (all 11 checks pass).
- **Real file backend (honest skips):** [`packages/cli/src/backend/tasks-md.conformance.test.ts`](../cli/src/backend/tasks-md.conformance.test.ts) — the file backend; `release-and-reclaim` passes, the collision-free classes skip.

## Report format

`runConformance(target)` returns a `ConformanceReport` (`{ target, results: { name, status: "pass"|"fail"|"skip", reason? }[] }`) — already JSON-serializable. `summarizeReport(report)` adds machine-readable counts for CI or a docs badge:

```json
{
  "target": "git-native (linear-CAS)",
  "certified": true,
  "passed": 11, "failed": 0, "skipped": 0,
  "results": [{ "name": "same-task-race", "status": "pass" }, ...]
}
```

`certified` is `true` iff no check **failed** — skips are allowed (they record an honestly-absent capability). Link the JSON from your backend's README so adopters can see exactly which classes you certify.

## Not a registry

This package documents how to self-certify; it is deliberately **not** a backend registry. tasks.md does not vet, list, or rank third-party backends — you publish your own report.
