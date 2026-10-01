import { execSync } from "node:child_process";
import {
  getAllTaskIds,
  isBlocked,
  findGitRoot,
  loadAllTasks,
  pickBestTask,
  type Task,
  type TaskFile,
  type PickResult,
} from "@tasks-md/parser";

export { findGitRoot, loadAllTasks, pickBestTask };
export type { Task, TaskFile, PickResult };

// ── List ──
//
// Parity wrapper for the MCP server's `list_tasks` tool. The CLI and MCP must
// not diverge on filtering semantics, so this function reuses the same
// `getAllTaskIds`, `isBlocked`, and tag/priority predicates as
// `packages/mcp/src/tools.ts:listTasksFromFiles`. Update both in lockstep when
// changing filter behavior.

export interface ListTasksOptions {
  priority?: string;
  tag?: string;
  unclaimedOnly?: boolean;
  unblockedOnly?: boolean;
}

export interface ListedTask {
  id?: string;
  summary: string;
  priority: string;
  tags: string[];
  blocked: boolean;
  claimed?: string;
  file: string;
  line: number;
}

export function listTasks(
  taskFiles: TaskFile[],
  options: ListTasksOptions = {}
): ListedTask[] {
  const allIds = getAllTaskIds(taskFiles);
  let tasks: Task[] = taskFiles.flatMap((f) => f.tasks);

  if (options.priority) {
    const wanted = options.priority.toUpperCase();
    tasks = tasks.filter((t) => t.priority.toUpperCase() === wanted);
  }

  if (options.tag) {
    const wanted = options.tag.toLowerCase();
    tasks = tasks.filter((t) =>
      t.metadata.tags?.some((tag) => tag.toLowerCase() === wanted)
    );
  }

  if (options.unclaimedOnly) {
    tasks = tasks.filter((t) => !t.claimed);
  }

  if (options.unblockedOnly) {
    tasks = tasks.filter((t) => !isBlocked(t, allIds));
  }

  // Priority lex-sort matches the MCP server (P0 < P1 < P2 < P3).
  tasks.sort((a, b) => a.priority.localeCompare(b.priority));

  return tasks.map((task) => ({
    id: task.metadata.id,
    summary: task.summary,
    priority: task.priority,
    tags: task.metadata.tags ?? [],
    blocked: isBlocked(task, allIds),
    claimed: task.claimed ?? undefined,
    file: task.file,
    line: task.startLine,
  }));
}

// ── Stats ──

export interface QueueStats {
  total: number;
  byPriority: Record<string, number>;
  blocked: number;
  claimed: number;
  available: number;
  fileCount: number;
  throughput: {
    total: number;
    week: number;
    month: number;
  };
  topAgents: Array<{ agent: string; count: number }>;
}

function countCompletedTasks(gitRoot: string, since?: string): number {
  try {
    const sinceArg = since ? ` --since="${since}"` : "";
    const output = execSync(
      `git log --all${sinceArg} -p -- "*/TASKS.md" "TASKS.md"`,
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 }
    );
    return (output.match(/^-- \[ \]/gm) ?? []).length;
  } catch {
    return 0;
  }
}

function extractTopAgents(gitRoot: string): Array<{ agent: string; count: number }> {
  try {
    const output = execSync(
      'git log --all -p -- "*/TASKS.md" "TASKS.md"',
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 }
    );
    const lines = output.match(/^-- \[ \].*\(@[^)]+\)/gm) ?? [];
    const counts = new Map<string, number>();
    for (const line of lines) {
      const match = line.match(/\(@([^)]+)\)/);
      if (match) {
        counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function getQueueStats(directory: string): QueueStats {
  const taskFiles = loadAllTasks(directory);
  const allIds = getAllTaskIds(taskFiles);
  const allTasks = taskFiles.flatMap((f) => f.tasks);

  const byPriority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let blocked = 0;
  let claimed = 0;

  for (const task of allTasks) {
    const priority = task.priority.toUpperCase();
    if (priority in byPriority) byPriority[priority]++;
    if (isBlocked(task, allIds)) blocked++;
    if (task.claimed) claimed++;
  }

  const gitRoot = findGitRoot(directory);

  return {
    total: allTasks.length,
    byPriority,
    blocked,
    claimed,
    available: allTasks.length - blocked - claimed,
    fileCount: taskFiles.length,
    throughput: {
      total: countCompletedTasks(gitRoot),
      week: countCompletedTasks(gitRoot, "1 week ago"),
      month: countCompletedTasks(gitRoot, "1 month ago"),
    },
    topAgents: extractTopAgents(gitRoot),
  };
}

// ── Diff ──

export interface QueueDiff {
  ref: string;
  added: string[];
  removed: string[];
  claimed: string[];
  hasChanges: boolean;
}

export function getQueueDiff(directory: string, ref = "HEAD"): QueueDiff {
  const gitRoot = findGitRoot(directory);
  let diffOutput: string;
  try {
    diffOutput = execSync(
      `git diff ${ref} -- "*/TASKS.md" "TASKS.md"`,
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 }
    );
  } catch {
    diffOutput = "";
  }

  if (!diffOutput.trim()) {
    return { ref, added: [], removed: [], claimed: [], hasChanges: false };
  }

  const added = (diffOutput.match(/^\+- \[ \] .+$/gm) ?? []).map((l) =>
    l.replace(/^\+- \[ \] /, "")
  );
  const removed = (diffOutput.match(/^-- \[ \] .+$/gm) ?? []).map((l) =>
    l.replace(/^-- \[ \] /, "")
  );
  const claimed = (diffOutput.match(/^\+- \[ \] .+\(@[^)]+\)$/gm) ?? []).map(
    (l) => l.replace(/^\+- \[ \] /, "")
  );

  return { ref, added, removed, claimed, hasChanges: true };
}
