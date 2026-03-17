import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseTasksContent,
  getAllTaskIds,
  isBlocked,
  type Task,
  type TaskFile,
} from "@tasks-md/parser";

export type { Task, TaskFile };

// ── Task Discovery & Loading ──

export function findGitRoot(startDir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return startDir;
  }
}

export function discoverTaskFiles(directory: string): string[] {
  const gitRoot = findGitRoot(directory);
  try {
    const output = execSync('fd --no-ignore-vcs -t f "^TASKS\\.md$"', {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!output) return [];
    return output.split("\n").map((file) => join(gitRoot, file));
  } catch {
    const fallback = join(gitRoot, "TASKS.md");
    return existsSync(fallback) ? [fallback] : [];
  }
}

export function loadAllTasks(directory: string): TaskFile[] {
  const files = discoverTaskFiles(directory);
  const results: TaskFile[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      results.push({ path: file, tasks: parseTasksContent(content, file) });
    } catch {
      // Skip unreadable files
    }
  }
  return results;
}

// ── Pick Task ──

export interface PickResult {
  task: Task;
  candidateCount: number;
  unblocksCount: number;
}

function countUnblocks(task: Task, allTasks: Task[]): number {
  if (!task.metadata.id) return 0;
  return allTasks.filter((t) =>
    t.metadata.blockedBy?.includes(task.metadata.id!)
  ).length;
}

export function pickBestTask(
  taskFiles: TaskFile[],
  tags?: string[]
): PickResult | undefined {
  const allIds = getAllTaskIds(taskFiles);
  const allTasks = taskFiles.flatMap((f) => f.tasks);

  let candidates = allTasks.filter(
    (t) => !t.claimed && !isBlocked(t, allIds)
  );

  if (tags?.length) {
    const filtered = candidates.filter((t) =>
      t.metadata.tags?.some((tag) =>
        tags.some((at) => at.toLowerCase() === tag.toLowerCase())
      )
    );
    if (filtered.length > 0) candidates = filtered;
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    const priorityDiff = a.priority.localeCompare(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return countUnblocks(b, allTasks) - countUnblocks(a, allTasks);
  });

  const picked = candidates[0];
  return {
    task: picked,
    candidateCount: candidates.length,
    unblocksCount: countUnblocks(picked, allTasks),
  };
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
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
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
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
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
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
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
