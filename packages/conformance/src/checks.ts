// The conformance battery. Each check throws on failure; the runner turns a
// throw into a `fail` result and a missing capability into a `skip`. Checks map
// 1:1 to the required properties in spec.md § "Fleet coordination" and the
// `conformance-backend-protocol` task acceptance.
//
// Checks treat the id RETURNED by `createTask` as canonical — a backend may
// honor a requested id (file/in-memory) or mint its own (git-native slugs from
// the title), so checks never assume the requested id survives.

import type {
  ConformanceCapabilities,
  ConformanceWorld,
} from "./types.js";

export interface Check {
  name: string;
  requires: (keyof ConformanceCapabilities)[];
  run: (world: ConformanceWorld) => Promise<void>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function rawEvent(fields: Record<string, unknown>): string {
  return JSON.stringify({
    schema_version: 1,
    event_id: "evt-x",
    task_id: "t",
    event_type: "created",
    actor_id: "seed",
    instance_id: "seed/i1",
    created_at: "2026-01-01T00:00:00.000Z",
    parent_event_ids: [],
    payload: {},
    ...fields,
  });
}

export const checks: Check[] = [
  {
    name: "same-task-race",
    requires: ["collisionFree"],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "race", title: "Race target" });
      const [a, b] = await Promise.all([
        world.claim("@alice", task.id),
        world.claim("@bob", task.id),
      ]);
      await world.sync();
      const winners = [a, b].filter((outcome) => outcome.status === "claimed");
      assert(
        winners.length === 1,
        `same-task race must have exactly one winner, got ${winners.length} (${a.status}/${b.status})`,
      );
      const loser = a.status === "claimed" ? b : a;
      assert(
        loser.status === "lost" || loser.status === "already_claimed",
        `loser must yield (lost/already_claimed), got "${loser.status}"`,
      );
      const open = await world.listOpen("@alice");
      const found = open.find((entry) => entry.id === task.id);
      assert(found !== undefined, "claimed task must still be open");
      assert(
        found?.assignee === winners[0]?.owner,
        `folded assignee (${found?.assignee}) must be the winner (${winners[0]?.owner})`,
      );
    },
  },
  {
    name: "different-task-race",
    requires: ["collisionFree"],
    run: async (world) => {
      const x = await world.createTask("seed", { id: "x", title: "Task X" });
      const y = await world.createTask("seed", { id: "y", title: "Task Y" });
      const [a, b] = await Promise.all([
        world.claim("@alice", x.id),
        world.claim("@bob", y.id),
      ]);
      await world.sync();
      assert(
        a.status === "claimed" && b.status === "claimed",
        `both different-task claims must win, got ${a.status}/${b.status}`,
      );
      const open = await world.listOpen("@alice");
      assert(open.find((t) => t.id === x.id)?.assignee === "alice", "task x must be owned by alice");
      assert(open.find((t) => t.id === y.id)?.assignee === "bob", "task y must be owned by bob");
    },
  },
  {
    name: "stale-snapshot",
    requires: ["generatedSnapshot"],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "done-soon", title: "Finish me" });
      const before = await world.render();
      assert(before.includes(task.id), "snapshot must show the open task before completion");
      await world.complete("@alice", task.id);
      const open = await world.listOpen("@alice");
      assert(
        open.find((t) => t.id === task.id) === undefined,
        "folded log must exclude a completed task even if a stale snapshot still shows it",
      );
    },
  },
  {
    name: "human-command-path",
    requires: ["mutableUpdate"],
    run: async (world) => {
      const task = await world.createTask("@alice", { id: "hcp", title: "Original" });
      await world.update("@alice", task.id, { title: "Updated title" });
      const open = await world.listOpen("@alice");
      assert(
        open.find((t) => t.id === task.id)?.title === "Updated title",
        "update must appear in fold(log)",
      );
    },
  },
  {
    name: "lease-expiry-and-steal",
    requires: ["leases"],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "leased", title: "Leased task" });
      const first = await world.claim("@alice", task.id);
      assert(first.status === "claimed", "first claim must succeed");
      const contested = await world.claim("@bob", task.id);
      assert(
        contested.status === "already_claimed",
        `a live claim blocks a second claimer, got "${contested.status}"`,
      );
      await world.expireLease?.(task.id);
      const stolen = await world.claim("@bob", task.id);
      assert(
        stolen.status === "claimed",
        `an expired lease must be reclaimable, got "${stolen.status}"`,
      );
      assert(
        stolen.claimId !== first.claimId,
        "the stealing claim must mint a fresh fencing token",
      );
    },
  },
  {
    name: "heartbeat-fencing",
    requires: ["leases"],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "hb", title: "Heartbeat task" });
      const claim = await world.claim("@alice", task.id);
      assert(claim.status === "claimed" && !!claim.claimId, "first claim must yield a token");
      // The live owner renews successfully.
      const live = await world.heartbeat?.("@alice", task.id, claim.claimId);
      assert(live?.status === "claimed", `the live owner must renew, got "${live?.status}"`);
      // The lease lapses and a contender steals it with a fresh token.
      await world.expireLease?.(task.id);
      const stolen = await world.claim("@bob", task.id);
      assert(stolen.status === "claimed", `an expired lease must be reclaimable, got "${stolen.status}"`);
      // The resurrected original owner must NOT renew the stolen claim — its old
      // token / ownership is stale, so the heartbeat is rejected (not "claimed").
      const stale = await world.heartbeat?.("@alice", task.id, claim.claimId);
      assert(
        stale?.status !== "claimed",
        `a resurrected owner whose lease was stolen must not renew, got "${stale?.status}"`,
      );
    },
  },
  {
    name: "canonical-serialization",
    requires: ["rawEventAppend"],
    run: async (world) => {
      await world.appendRawEvent?.(
        rawEvent({ event_id: "evt-r1", task_id: "raw", payload: { title: "Raw task" } }),
      );
      let open = await world.listOpen("seed");
      assert(open.filter((t) => t.id === "raw").length === 1, "valid event must create the task");

      // Duplicate event_id is ignored.
      await world.appendRawEvent?.(
        rawEvent({ event_id: "evt-r1", task_id: "raw", payload: { title: "Dup" } }),
      );
      // Reordered-key duplicate (same event_id) is also ignored.
      await world.appendRawEvent?.(
        JSON.stringify({
          payload: { title: "Reordered dup" },
          event_type: "created",
          task_id: "raw",
          schema_version: 1,
          actor_id: "seed",
          event_id: "evt-r1",
          instance_id: "seed/i1",
          parent_event_ids: [],
          created_at: "2026-01-01T00:00:00.000Z",
        }),
      );
      // Malformed JSON is skipped, not fatal.
      await world.appendRawEvent?.("{not valid json");
      // Unknown schema version is ignored.
      await world.appendRawEvent?.(
        rawEvent({ event_id: "evt-r2", task_id: "future", schema_version: 99, payload: { title: "Future" } }),
      );

      open = await world.listOpen("seed");
      assert(
        open.filter((t) => t.id === "raw").length === 1,
        "duplicate/reordered events must not double-create",
      );
      assert(
        open.find((t) => t.id === "future") === undefined,
        "unknown schema_version must be ignored",
      );
    },
  },
  {
    name: "claim-fencing",
    requires: ["pathScopedEnforcement"],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "fenced", title: "Fenced task" });
      const claim = await world.claim("@alice", task.id);
      assert(claim.status === "claimed" && claim.claimId, "claim must yield a fencing token");
      const ok = await world.checkWorkPush?.({
        paths: ["src/feature.ts"],
        taskId: task.id,
        claimId: claim.claimId,
      });
      assert(ok === "allowed", "a code push with the live fencing token must be allowed");
      const wrong = await world.checkWorkPush?.({
        paths: ["src/feature.ts"],
        taskId: task.id,
        claimId: "claim-wrong",
      });
      assert(wrong === "rejected", "a stale/wrong fencing token must be rejected");
      const none = await world.checkWorkPush?.({ paths: ["src/feature.ts"], taskId: task.id });
      assert(none === "rejected", "a code push with no fencing token must be rejected");
    },
  },
  {
    name: "release-and-reclaim",
    requires: [],
    run: async (world) => {
      const task = await world.createTask("seed", { id: "rr", title: "Release/reclaim" });
      const first = await world.claim("@alice", task.id);
      assert(first.status === "claimed", "first claim must succeed");
      await world.release("@alice", task.id);
      const second = await world.claim("@bob", task.id);
      assert(second.status === "claimed", `released task must be reclaimable, got "${second.status}"`);
    },
  },
  {
    name: "blocked-by-unclaimable",
    requires: ["blockedBy"],
    run: async (world) => {
      const blocker = await world.createTask("seed", { id: "blocker", title: "Blocker" });
      const dependent = await world.createTask("seed", {
        id: "dependent",
        title: "Dependent",
        blockedBy: [blocker.id],
      });
      const blocked = await world.claim("@alice", dependent.id);
      assert(
        blocked.status === "blocked",
        `a blocked task must be unclaimable, got "${blocked.status}"`,
      );
      await world.complete("@bob", blocker.id);
      const unblocked = await world.claim("@alice", dependent.id);
      assert(
        unblocked.status === "claimed",
        `a task must be claimable once its blocker closes, got "${unblocked.status}"`,
      );
    },
  },
  {
    name: "idempotent-projection",
    requires: ["generatedSnapshot"],
    run: async (world) => {
      const alpha = await world.createTask("seed", { id: "p0a", title: "Alpha", priority: "P0" });
      await world.createTask("seed", { id: "p1b", title: "Beta", priority: "P1" });
      await world.claim("@alice", alpha.id);
      const first = await world.render();
      const second = await world.render();
      assert(first === second, "render() must be byte-idempotent for the same log");
    },
  },
  {
    name: "path-scoped-enforcement",
    requires: ["pathScopedEnforcement"],
    run: async (world) => {
      const docsOnly = await world.checkWorkPush?.({ paths: ["docs/readme.md", "TASKS.md"] });
      assert(docsOnly === "allowed", "a markdown-only change must pass without a claim");
      const codeInDocs = await world.checkWorkPush?.({ paths: ["docs/migrate.py"] });
      assert(
        codeInDocs === "rejected",
        "executable code under docs/ without a live claim must be rejected",
      );
      const task = await world.createTask("seed", { id: "mix", title: "Mixed change" });
      const claim = await world.claim("@alice", task.id);
      const mixed = await world.checkWorkPush?.({
        paths: ["docs/readme.md", "src/code.ts"],
        taskId: task.id,
        claimId: claim.claimId,
      });
      assert(mixed === "allowed", "a claimed mixed change must be allowed");
    },
  },
];
