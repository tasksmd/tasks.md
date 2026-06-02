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
  /** Backend-native URL, when one exists (issue URL). */
  url?: string;
}

export interface CreateTaskInput {
  title: string;
  priority?: string;
  body?: string;
  tags?: string[];
}

export type ClaimMode = "best-effort" | "collision-free" | "external";
export type SourceOfTruth = "tasks-md" | "log" | "github-issues";

export interface BackendCapabilities {
  claims: ClaimMode;
  sourceOfTruth: SourceOfTruth;
  generatedSnapshot: boolean;
}

export interface ClaimTaskOptions {
  actorId?: string;
  instanceId?: string;
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
  create(input: CreateTaskInput): Promise<BackendTask>;
  claim(id: string, options?: ClaimTaskOptions): Promise<ClaimTaskResult>;
  complete(id: string): Promise<void>;
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
