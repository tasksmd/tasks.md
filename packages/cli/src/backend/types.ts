// Task backend abstraction (VISION.md G5 — file-first, pluggable backends).
//
// `tasks-md` (local TASKS.md) is the default, canonical backend. A repo MAY
// opt into an alternative backend (e.g. `github-issues`) so a team already
// living in an issue tracker can use the tasks.md workflow without migrating.
// Every backend implements the same `TaskBackend` surface, so the CLI/MCP
// commands behave identically regardless of where the work is stored.

/** A single unit of work, backend-agnostic. */
export interface BackendTask {
  /** Stable id. For github-issues this is the issue number as a string. */
  id: string;
  title: string;
  /** Priority bucket: "P0" | "P1" | "P2" | "P3". */
  priority: string;
  tags: string[];
  /** Who has claimed it (assignee login), if anyone. */
  assignee?: string;
  /** Optional longer description / body. */
  body?: string;
  /** Free-form external blocker reason (`**Blocked**`); any value makes it unpickable. */
  blocked?: string;
  /** Task ids this depends on (`**Blocked by**`); unpickable while any is still open. */
  blockedBy?: string[];
  /** Backend-native URL, when one exists (issue URL). */
  url?: string;
}

export interface CreateTaskInput {
  title: string;
  priority?: string;
  body?: string;
  tags?: string[];
  blocked?: string;
  blockedBy?: string[];
}

export type ClaimMode = "best-effort" | "collision-free" | "external";
export type SourceOfTruth = "tasks-md" | "log" | "github-issues";

/** The backend-neutral task operations (spec.md § "Agent-mediated task operations"). */
export type TaskOperation =
  | "create"
  | "update"
  | "claim"
  | "release"
  | "complete"
  | "cancel"
  | "render"
  | "list";

export interface BackendCapabilities {
  /** How claiming behaves: best-effort (file), collision-free (git-native), external (issues). */
  claims: ClaimMode;
  sourceOfTruth: SourceOfTruth;
  /** `TASKS.md` is a generated projection of backend state, not the source. */
  generatedSnapshot: boolean;
  /** Claims carry an expiring lease that lets a dead owner be reclaimed. */
  supportsLeases: boolean;
  /** The backend needs a git remote / network to coordinate. */
  requiresRemote: boolean;
  /** A human may safely hand-edit the human-readable surface (`TASKS.md`). */
  humanEditableSnapshot: boolean;
  /** Which operations this backend performs; the rest return `unsupported`. */
  operations: Record<TaskOperation, boolean>;
}

export interface ClaimTaskOptions {
  actorId?: string;
  instanceId?: string;
  /**
   * Fencing token from a prior `claim`. When passed to `complete`/`release`,
   * a backend that supports leases rejects the op if the token no longer
   * matches the live claim (the lease was stolen) — so a restarted/stale agent
   * cannot close work it no longer owns.
   */
  claimId?: string;
}

/** Actor context threaded into every mutating operation. */
export type ActorOptions = ClaimTaskOptions;

export interface UpdateTaskInput {
  title?: string;
  priority?: string;
  body?: string;
  tags?: string[];
  blocked?: string;
  blockedBy?: string[];
}

export type OperationStatus =
  | "ok"
  | "unsupported"
  | "missing"
  | "blocked"
  | "noop"
  | "conflict";

export interface OperationResult {
  status: OperationStatus;
  backend: string;
  operation: TaskOperation;
  taskId?: string;
  reason?: string;
}

export interface RenderResult {
  status: "ok" | "unsupported";
  backend: string;
  /** The rendered human-readable snapshot, when `status` is `ok`. */
  content?: string;
  reason?: string;
}

export type ClaimTaskStatus =
  | "claimed"
  | "already_claimed"
  | "blocked"
  | "missing"
  | "lost";

export interface ClaimTaskResult {
  status: ClaimTaskStatus;
  backend: string;
  taskId: string;
  capabilities: BackendCapabilities;
  owner?: string;
  currentOwner?: string;
  claimId?: string;
  reason?: string;
}

export interface TaskBackend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;
  listOpen(): Promise<BackendTask[]>;
  next(): Promise<BackendTask | null>;
  create(input: CreateTaskInput, options?: ActorOptions): Promise<BackendTask>;
  update(id: string, patch: UpdateTaskInput, options?: ActorOptions): Promise<OperationResult>;
  claim(id: string, options?: ClaimTaskOptions): Promise<ClaimTaskResult>;
  release(id: string, options?: ActorOptions): Promise<OperationResult>;
  complete(id: string, options?: ActorOptions): Promise<OperationResult>;
  cancel(id: string, options?: ActorOptions): Promise<OperationResult>;
  render(): Promise<RenderResult>;
  /**
   * Renew a live claim's lease (lease-backed backends only). Backends without
   * leases omit it; callers should treat its absence as "no heartbeat needed".
   */
  heartbeat?(id: string, options?: ClaimTaskOptions): Promise<OperationResult>;
}

/** Priority bucket → sort rank (P0 most urgent). */
export const PRIORITY_RANK: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Sort a task list in place by priority (P0 first), stable on ties. */
export function sortByPriority<T extends { priority: string }>(tasks: T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const ra = PRIORITY_RANK[a.task.priority] ?? 2;
      const rb = PRIORITY_RANK[b.task.priority] ?? 2;
      return ra === rb ? a.index - b.index : ra - rb;
    })
    .map((entry) => entry.task);
}

export function formatClaimResult(result: ClaimTaskResult): string {
  if (result.status === "claimed" && result.claimId && result.owner) {
    return `Claimed ${result.taskId} for ${result.owner} with claim ${result.claimId}.`;
  }
  if (result.status === "claimed" && result.owner) {
    return `Claimed ${result.taskId} for ${result.owner} using ${result.capabilities.claims} ${result.backend} claims.`;
  }
  if (result.status === "already_claimed" && result.currentOwner) {
    return `${result.taskId} is already claimed by ${result.currentOwner}.`;
  }
  if (result.reason) {
    return `${result.taskId} ${result.status}: ${result.reason}`;
  }
  return `${result.taskId} ${result.status}.`;
}

export function unsupportedResult(
  backend: string,
  operation: TaskOperation,
  reason: string,
  taskId?: string,
): OperationResult {
  return { status: "unsupported", backend, operation, taskId, reason };
}

export function formatOperationResult(result: OperationResult): string {
  const where = result.taskId ? ` ${result.taskId}` : "";
  if (result.status === "ok") {
    return `${result.operation}${where}: ok (${result.backend}).`;
  }
  if (result.reason) {
    return `${result.operation}${where} ${result.status}: ${result.reason}`;
  }
  return `${result.operation}${where} ${result.status} (${result.backend}).`;
}
