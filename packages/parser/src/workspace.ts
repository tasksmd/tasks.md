// Workspace-mode discovery (spec.md § Workspaces). A workspace is a directory
// whose immediate children are repos, each carrying a TASKS.md. This module is
// structural only and dependency-free — YAML config parsing lives in the CLI.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parseTasksContent } from "./index.js";
import type { Task } from "./index.js";

export const WORKSPACE_SENTINEL = ".tasks-md-workspace";

export interface WorkspaceRepo {
  /** Directory name of the repo within the workspace (`.` for the root itself). */
  repoName: string;
  root: string;
  taskFile: string;
  tasks: Task[];
}

export interface WorkspaceResult {
  workspaceRoot: string;
  /** Defaults to the last path segment of the root. */
  workspaceName: string;
  repos: WorkspaceRepo[];
}

/** A task annotated with the workspace + repo it came from (for aggregation). */
export interface WorkspaceTask {
  task: Task;
  workspaceName: string;
  workspaceRoot: string;
  repoName: string;
  taskFile: string;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** True if `dir` looks like a workspace: a sentinel file, or ≥2 child repos. */
export function isWorkspace(dir: string): boolean {
  if (existsSync(join(dir, WORKSPACE_SENTINEL))) {
    return true;
  }
  return discoverRepos(dir).length >= 2;
}

/** Immediate child dirs (and the root itself) that carry a TASKS.md. */
function discoverRepos(root: string): string[] {
  const repos: string[] = [];
  if (existsSync(join(root, "TASKS.md"))) {
    repos.push(root);
  }
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return repos;
  }
  for (const entry of entries.sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) {
      continue;
    }
    const child = join(root, entry);
    if (isDir(child) && existsSync(join(child, "TASKS.md"))) {
      repos.push(child);
    }
  }
  return repos;
}

export function parseWorkspace(root: string, name?: string): WorkspaceResult {
  const workspaceName = name ?? basename(root);
  const repos: WorkspaceRepo[] = discoverRepos(root).map((repoRoot) => {
    const repoName = repoRoot === root ? "." : basename(repoRoot);
    const taskFile = join(repoRoot, "TASKS.md");
    let tasks: Task[] = [];
    try {
      tasks = parseTasksContent(readFileSync(taskFile, "utf-8"), taskFile);
    } catch {
      // Skip unreadable TASKS.md
    }
    return { repoName, root: repoRoot, taskFile, tasks };
  });
  return { workspaceRoot: root, workspaceName, repos };
}

/** Parse several workspaces; `names[i]` overrides the default name for `roots[i]`. */
export function parseWorkspaces(roots: string[], names?: string[]): WorkspaceResult[] {
  return roots.map((root, index) => parseWorkspace(root, names?.[index]));
}

/** Flatten workspaces into repo+workspace-attributed tasks for aggregation. */
export function workspaceTasks(workspaces: WorkspaceResult[]): WorkspaceTask[] {
  const flat: WorkspaceTask[] = [];
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      for (const task of repo.tasks) {
        flat.push({
          task,
          workspaceName: ws.workspaceName,
          workspaceRoot: ws.workspaceRoot,
          repoName: repo.repoName,
          taskFile: repo.taskFile,
        });
      }
    }
  }
  return flat;
}

export interface BlockerRef {
  workspace?: string;
  repo?: string;
  taskId: string;
}

/**
 * Parse a `**Blocked by**` reference at any scope:
 *   `<workspace>::<repo>#<task-id>` · `<repo>#<task-id>` · `<task-id>`
 */
export function parseBlockerRef(ref: string): BlockerRef {
  const trimmed = ref.trim();
  let workspace: string | undefined;
  let rest = trimmed;
  const wsSep = rest.indexOf("::");
  if (wsSep !== -1) {
    workspace = rest.slice(0, wsSep);
    rest = rest.slice(wsSep + 2);
  }
  let repo: string | undefined;
  const repoSep = rest.indexOf("#");
  if (repoSep !== -1) {
    repo = rest.slice(0, repoSep);
    rest = rest.slice(repoSep + 1);
  }
  return { workspace, repo, taskId: rest };
}

/**
 * Resolve whether a blocker reference still points at an OPEN task across the
 * aggregated workspace set. Returns true if the blocker is unresolved (i.e. the
 * referenced task still exists / is open) — so the dependent stays blocked.
 */
export function isBlockerOpen(ref: string, all: WorkspaceTask[]): boolean {
  const parsed = parseBlockerRef(ref);
  return all.some((entry) => {
    if (entry.task.metadata.id !== parsed.taskId) {
      return false;
    }
    if (parsed.repo && entry.repoName !== parsed.repo) {
      return false;
    }
    if (parsed.workspace && entry.workspaceName !== parsed.workspace) {
      return false;
    }
    return true;
  });
}
