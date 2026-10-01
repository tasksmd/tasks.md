// An in-memory reference model of the git-native fleet semantics
// (spec.md § "Fleet coordination"). It is the executable spec: the reference
// target is a faithful implementation, and the broken target is the same model
// with specific bugs injected so the suite demonstrably catches them.
//
// Concurrency model: a single shared append-only log guarded by a `version`
// counter that stands in for git's atomic ref compare-and-swap. `claim` reads
// the version, yields a microtask (the network window), then commits only if
// the version is unchanged — so two `claim` calls started together both read
// the same pre-claim state and exactly one wins, just like a non-fast-forward
// push rejection.

import { randomUUID } from "node:crypto";
import type {
  ClaimOutcome,
  ConformanceTask,
  ConformanceWorld,
  CreateInput,
  EnforcementOutcome,
  UpdateInput,
  WorkChange,
} from "./types.js";

type EventType =
  | "created"
  | "updated"
  | "claimed"
  | "released"
  | "completed"
  | "cancelled";

interface Event {
  schema_version: number;
  event_id: string;
  task_id: string;
  event_type: EventType;
  actor_id: string;
  instance_id: string;
  created_at: string;
  parent_event_ids: string[];
  payload: Record<string, unknown>;
}

interface FoldedTask {
  task: ConformanceTask;
  owner?: string;
  claimId?: string;
  leaseExpired: boolean;
  closed: boolean;
}

export interface ModelBugs {
  /** Skip the compare-and-swap so concurrent claims both win (not collision-free). */
  noCas?: boolean;
  /** Append a nondeterministic comment so the projection is not byte-idempotent. */
  nonIdempotentRender?: boolean;
  /** Allow every work push regardless of path or fencing token. */
  noEnforcement?: boolean;
  /** Let a stale/non-owner renew a lease via heartbeat (breaks resurrected-owner fencing). */
  noHeartbeatFencing?: boolean;
}

const PRIORITIES = ["P0", "P1", "P2", "P3"];

function microtask(): Promise<void> {
  return Promise.resolve();
}

function normalizePriority(value: string | undefined): string {
  const upper = value?.toUpperCase();
  return upper && PRIORITIES.includes(upper) ? upper : "P2";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

function parseEvent(text: string): Event | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.schema_version !== 1) {
    return undefined;
  }
  const eventId = stringValue(raw.event_id);
  const taskId = stringValue(raw.task_id);
  const eventType = stringValue(raw.event_type);
  const actorId = stringValue(raw.actor_id);
  const validType =
    eventType === "created" ||
    eventType === "updated" ||
    eventType === "claimed" ||
    eventType === "released" ||
    eventType === "completed" ||
    eventType === "cancelled";
  if (!eventId || !taskId || !validType || !actorId || !isRecord(raw.payload)) {
    return undefined;
  }
  return {
    schema_version: 1,
    event_id: eventId,
    task_id: taskId,
    event_type: eventType,
    actor_id: actorId,
    instance_id: stringValue(raw.instance_id) ?? actorId,
    created_at: stringValue(raw.created_at) ?? new Date(0).toISOString(),
    parent_event_ids: stringArray(raw.parent_event_ids),
    payload: raw.payload,
  };
}

export class InMemoryFleet implements ConformanceWorld {
  private readonly log: Event[] = [];
  private version = 0;
  private readonly seenEventIds = new Set<string>();

  constructor(private readonly bugs: ModelBugs = {}) {}

  private commit(event: Event): void {
    if (this.seenEventIds.has(event.event_id)) {
      return;
    }
    this.seenEventIds.add(event.event_id);
    this.log.push(event);
    this.version += 1;
  }

  private makeEvent(
    taskId: string,
    eventType: EventType,
    actor: string,
    payload: Record<string, unknown>,
  ): Event {
    return {
      schema_version: 1,
      event_id: `evt-${randomUUID()}`,
      task_id: taskId,
      event_type: eventType,
      actor_id: actor.replace(/^@/, ""),
      instance_id: `${actor.replace(/^@/, "")}/i1`,
      created_at: new Date().toISOString(),
      parent_event_ids: [],
      payload,
    };
  }

  private fold(): Map<string, FoldedTask> {
    const tasks = new Map<string, FoldedTask>();
    for (const event of this.log) {
      if (event.event_type === "created") {
        const title = stringValue(event.payload.title);
        if (!title || tasks.has(event.task_id)) {
          continue;
        }
        tasks.set(event.task_id, {
          task: {
            id: event.task_id,
            title,
            priority: normalizePriority(stringValue(event.payload.priority)),
            tags: stringArray(event.payload.tags),
            body: stringValue(event.payload.body),
            blockedBy: stringArray(event.payload.blocked_by),
          },
          leaseExpired: false,
          closed: false,
        });
        continue;
      }
      const folded = tasks.get(event.task_id);
      if (!folded) {
        continue;
      }
      if (event.event_type === "updated") {
        const { title, priority, tags, body } = event.payload;
        if (typeof title === "string") folded.task.title = title;
        if (typeof priority === "string") {
          folded.task.priority = normalizePriority(priority);
        }
        if (Array.isArray(tags)) folded.task.tags = stringArray(tags);
        if (typeof body === "string") folded.task.body = body;
      } else if (event.event_type === "claimed" && !folded.closed) {
        const liveOwner =
          folded.owner && !folded.leaseExpired ? folded.owner : undefined;
        if (!liveOwner) {
          const claimId = stringValue(event.payload.claim_id);
          folded.owner = event.actor_id;
          folded.claimId = claimId;
          folded.leaseExpired = claimId
            ? this.expiredClaimIds.has(claimId)
            : false;
          folded.task.assignee = folded.leaseExpired ? undefined : event.actor_id;
        }
      } else if (event.event_type === "released") {
        if (folded.owner === event.actor_id) {
          folded.owner = undefined;
          folded.claimId = undefined;
          folded.leaseExpired = false;
          folded.task.assignee = undefined;
        }
      } else if (
        event.event_type === "completed" ||
        event.event_type === "cancelled"
      ) {
        folded.closed = true;
      }
    }
    return tasks;
  }

  private openTasks(): FoldedTask[] {
    return [...this.fold().values()]
      .filter((entry) => !entry.closed)
      .sort(
        (a, b) =>
          PRIORITIES.indexOf(a.task.priority) -
          PRIORITIES.indexOf(b.task.priority),
      );
  }

  private isBlocked(folded: FoldedTask, all: Map<string, FoldedTask>): boolean {
    return (folded.task.blockedBy ?? []).some((id) => {
      const blocker = all.get(id);
      return blocker !== undefined && !blocker.closed;
    });
  }

  async createTask(actor: string, input: CreateInput): Promise<ConformanceTask> {
    const id = input.id ?? `task-${randomUUID().slice(0, 8)}`;
    this.commit(
      this.makeEvent(id, "created", actor, {
        title: input.title,
        priority: normalizePriority(input.priority),
        tags: input.tags ?? [],
        body: input.body,
        blocked_by: input.blockedBy ?? [],
      }),
    );
    return {
      id,
      title: input.title,
      priority: normalizePriority(input.priority),
      tags: input.tags ?? [],
      body: input.body,
      blockedBy: input.blockedBy ?? [],
    };
  }

  async claim(actor: string, taskId: string): Promise<ClaimOutcome> {
    const actorId = actor.replace(/^@/, "");
    const seenVersion = this.version;
    const all = this.fold();
    const before = all.get(taskId);
    if (!before || before.closed) {
      return { status: "missing" };
    }
    if (this.isBlocked(before, all)) {
      return { status: "blocked" };
    }
    const liveOwner =
      before.owner && !before.leaseExpired ? before.owner : undefined;
    if (liveOwner && liveOwner !== actorId && !this.bugs.noCas) {
      return { status: "already_claimed", owner: liveOwner };
    }

    // The network window: another participant may commit while we wait.
    await microtask();

    if (!this.bugs.noCas && this.version !== seenVersion) {
      const now = this.fold().get(taskId);
      const liveNow = now?.owner && !now.leaseExpired ? now.owner : undefined;
      if (liveNow && liveNow !== actorId) {
        return { status: "lost", owner: liveNow };
      }
    }

    const claimId = `claim-${randomUUID()}`;
    this.commit(
      this.makeEvent(taskId, "claimed", actorId, {
        claim_id: claimId,
        lease_expires: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    return { status: "claimed", claimId, owner: actorId };
  }

  async heartbeat(actor: string, taskId: string, claimId?: string): Promise<ClaimOutcome> {
    const actorId = actor.replace(/^@/, "");
    const folded = this.fold().get(taskId);
    if (!folded || folded.closed) {
      return { status: "missing" };
    }
    // The fence: only the live owner (lease not expired) holding the current
    // token may renew. A resurrected owner whose claim was stolen/replaced — or
    // any non-owner — must be rejected, so it cannot keep a dead claim alive.
    if (this.bugs.noHeartbeatFencing) {
      return { status: "claimed", claimId: folded.claimId, owner: folded.owner };
    }
    const liveOwner = folded.owner && !folded.leaseExpired ? folded.owner : undefined;
    if (liveOwner !== actorId || (claimId !== undefined && folded.claimId !== claimId)) {
      return { status: "already_claimed", owner: liveOwner };
    }
    return { status: "claimed", claimId: folded.claimId, owner: actorId };
  }

  async release(actor: string, taskId: string): Promise<void> {
    this.commit(this.makeEvent(taskId, "released", actor, {}));
  }

  async complete(actor: string, taskId: string): Promise<void> {
    this.commit(this.makeEvent(taskId, "completed", actor, {}));
  }

  async cancel(actor: string, taskId: string, reason?: string): Promise<void> {
    this.commit(this.makeEvent(taskId, "cancelled", actor, { reason }));
  }

  async update(actor: string, taskId: string, patch: UpdateInput): Promise<void> {
    this.commit(this.makeEvent(taskId, "updated", actor, { ...patch }));
  }

  async listOpen(_actor: string): Promise<ConformanceTask[]> {
    return this.openTasks().map((entry) => ({ ...entry.task }));
  }

  async render(): Promise<string> {
    const open = this.openTasks();
    const lines = ["# Tasks", ""];
    for (const priority of PRIORITIES) {
      lines.push(`## ${priority}`, "");
      for (const entry of open.filter((t) => t.task.priority === priority)) {
        const claim = entry.task.assignee ? ` (@${entry.task.assignee})` : "";
        lines.push(`- [ ] ${entry.task.title}${claim}`, `  - **ID**: ${entry.task.id}`, "");
      }
    }
    const body = `${lines.join("\n").trimEnd()}\n`;
    if (this.bugs.nonIdempotentRender) {
      return `${body}<!-- generated ${Date.now()}-${randomUUID()} -->\n`;
    }
    return body;
  }

  async sync(): Promise<void> {
    // Single shared log — nothing to propagate.
  }

  async appendRawEvent(raw: string): Promise<void> {
    const event = parseEvent(raw);
    if (event) {
      this.commit(event);
    }
  }

  async expireLease(taskId: string): Promise<void> {
    // Force the current live claim's lease into the past so another agent can
    // steal it. We remember the expired `claim_id`; the fold treats any claim
    // with that id as not-live, and a fresh steal mints a new (live) id.
    const folded = this.fold().get(taskId);
    if (folded?.claimId && folded.owner && !folded.leaseExpired) {
      this.expiredClaimIds.add(folded.claimId);
      this.version += 1;
    }
  }

  private readonly expiredClaimIds = new Set<string>();

  checkWorkPush(change: WorkChange): EnforcementOutcome {
    if (this.bugs.noEnforcement) {
      return "allowed";
    }
    const allMarkdown = change.paths.every((path) =>
      path.toLowerCase().endsWith(".md"),
    );
    if (allMarkdown) {
      return "allowed";
    }
    if (!change.taskId || !change.claimId) {
      return "rejected";
    }
    const folded = this.fold().get(change.taskId);
    const liveClaimId =
      folded && !folded.closed && folded.owner && !folded.leaseExpired
        ? folded.claimId
        : undefined;
    return liveClaimId && liveClaimId === change.claimId ? "allowed" : "rejected";
  }
}
