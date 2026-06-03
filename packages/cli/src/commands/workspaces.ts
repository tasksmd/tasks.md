import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  isBlockerOpen,
  isWorkspace,
  parseWorkspaces,
  workspaceTasks,
  type WorkspaceTask,
} from "@tasks-md/parser";
import {
  expandTilde,
  loadWorkspacesConfig,
  resolveWorkspaceSelection,
  saveWorkspacesConfig,
  type WorkspaceSelection,
  type WorkspacesConfig,
} from "../config/workspaces.js";

export { resolveWorkspaceSelection };

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function isStandingLoop(entry: WorkspaceTask): boolean {
  return (
    entry.task.metadata.id === "standing-audit-gap-loop" ||
    (entry.task.metadata.tags ?? []).includes("standing-loop")
  );
}

function isPickable(entry: WorkspaceTask, all: WorkspaceTask[]): boolean {
  if (entry.task.claimed) return false;
  if (entry.task.metadata.blocked && entry.task.metadata.blocked.trim()) return false;
  if (isStandingLoop(entry)) return false;
  const blockedBy = entry.task.metadata.blockedBy ?? [];
  return !blockedBy.some((ref) => isBlockerOpen(ref, all));
}

export interface WorkspacePick {
  entry: WorkspaceTask;
  /** `<workspace>::<repo>:<task-id>` (or `<workspace>::<repo>:<summary>` w/o id). */
  ref: string;
}

export interface WorkspacePickResult {
  summary: string;
  pick?: WorkspacePick;
}

/** Aggregate across the selected workspaces and pick the global top task. */
export function pickAcrossWorkspaces(selection: WorkspaceSelection): WorkspacePickResult {
  const workspaces = parseWorkspaces(selection.roots, selection.names);
  const all = workspaceTasks(workspaces);
  const repoCount = workspaces.reduce((n, ws) => n + ws.repos.length, 0);
  const pickable = all.filter((entry) => isPickable(entry, all));
  const summary = `scanned ${workspaces.length} workspace(s), ${repoCount} repo(s), ${pickable.length} unblocked`;

  pickable.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.task.priority] ?? 99) - (PRIORITY_RANK[b.task.priority] ?? 99);
    if (pr !== 0) return pr;
    return a.taskFile.localeCompare(b.taskFile);
  });
  const top = pickable[0];
  if (!top) {
    return { summary };
  }
  const id = top.task.metadata.id ?? top.task.summary;
  return { summary, pick: { entry: top, ref: `${top.workspaceName}::${top.repoName}:${id}` } };
}

// ── `tasks workspaces <list|add|detect>` ──

export function runWorkspacesList(): string[] {
  const config = loadWorkspacesConfig();
  const lines: string[] = [];
  if (!config || config.workspaces.length === 0) {
    lines.push("No configured workspaces. Run `tasks workspaces detect` or `tasks workspaces add <path>`.");
  } else {
    lines.push(`Configured workspaces (${config.workspaces.length}):`);
    for (const ws of config.workspaces) {
      const repos = existsSync(ws.root) ? countRepos(ws.root) : 0;
      lines.push(`  ${ws.name}  ${ws.root}  (${repos} repos)`);
    }
  }
  const scanRoots = (config?.discovery?.scanRoots ?? ["~/apps"]).map(expandTilde);
  const detected = detectWorkspaces(scanRoots).filter(
    (root) => !config?.workspaces.some((w) => w.root === root),
  );
  if (detected.length > 0) {
    lines.push(`Auto-detected (not yet configured): ${detected.join(", ")}`);
  }
  return lines;
}

export function runWorkspacesAdd(path: string, name?: string): string[] {
  const root = expandTilde(path);
  const config: WorkspacesConfig = loadWorkspacesConfig() ?? { workspaces: [] };
  const resolvedName = name ?? basename(root);
  if (config.workspaces.some((w) => w.root === root || w.name === resolvedName)) {
    return [`Workspace "${resolvedName}" (${root}) is already configured.`];
  }
  config.workspaces.push({ name: resolvedName, root });
  saveWorkspacesConfig(config);
  return [`Added workspace "${resolvedName}" → ${root}.`];
}

export function runWorkspacesDetect(scanRoot?: string): string[] {
  const config = loadWorkspacesConfig();
  const roots = scanRoot
    ? [expandTilde(scanRoot)]
    : (config?.discovery?.scanRoots ?? ["~/apps"]).map(expandTilde);
  const detected = detectWorkspaces(roots);
  if (detected.length === 0) {
    return [`No workspaces detected under: ${roots.join(", ")}`];
  }
  const lines = [`Detected ${detected.length} workspace(s) under ${roots.join(", ")}:`];
  for (const root of detected) {
    const configured = config?.workspaces.some((w) => w.root === root) ? " (configured)" : "";
    lines.push(`  ${basename(root)}  ${root}  (${countRepos(root)} repos)${configured}`);
  }
  lines.push("Add one with: tasks workspaces add <path> [--name <name>]");
  return lines;
}

function countRepos(root: string): number {
  let n = existsSync(join(root, "TASKS.md")) ? 1 : 0;
  try {
    for (const entry of readdirSync(root)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const child = join(root, entry);
      if (statSync(child).isDirectory() && existsSync(join(child, "TASKS.md"))) n += 1;
    }
  } catch {
    // ignore
  }
  return n;
}

function detectWorkspaces(scanRoots: string[]): string[] {
  const found: string[] = [];
  for (const scanRoot of scanRoots) {
    let entries: string[];
    try {
      entries = readdirSync(scanRoot);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const dir = join(scanRoot, entry);
      try {
        if (statSync(dir).isDirectory() && isWorkspace(dir)) {
          found.push(dir);
        }
      } catch {
        // ignore
      }
    }
  }
  return found;
}
