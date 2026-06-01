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
  /** "P0".."P3"; defaults to P2 when omitted. */
  priority?: string;
  body?: string;
  tags?: string[];
}

/**
 * The uniform surface every backend implements. Read ops (listOpen/next) work
 * everywhere; write ops (create/claim/complete) mutate the backing store.
 */
export interface TaskBackend {
  /** Human-readable backend name, e.g. "GitHub Issues" or "TASKS.md". */
  readonly name: string;
  /** Open tasks, sorted highest-priority (P0) first. */
  listOpen(): Promise<BackendTask[]>;
  /** Highest-priority open + unclaimed task, or null when the queue is empty. */
  next(): Promise<BackendTask | null>;
  /** File a new task; returns the created task. */
  create(input: CreateTaskInput): Promise<BackendTask>;
  /** Claim a task (assign it to the current actor). */
  claim(id: string): Promise<void>;
  /** Mark a task complete (close the issue / remove the TASKS.md block). */
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
