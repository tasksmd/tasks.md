import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isWorkspace, parseBlockerRef, parseTasksContent } from "@tasks-md/parser";
import { getBackend, resolveBackendConfig } from "../backend/index.js";
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

/** A task from any backend, annotated with its workspace + repo for ranking. */
export interface UnifiedEntry {
  id: string;
  title: string;
  priority: string;
  assignee?: string;
  blockedBy: string[];
  blocked?: string;
  standingLoop: boolean;
  workspaceName: string;
  repoName: string;
  file: string;
  line: number;
  backend: string;
}

/** Immediate child dirs (and the root) that carry a TASKS.md OR a .tasksmd.json. */
function discoverRepoRoots(root: string): string[] {
  const roots: string[] = [];
  const isRepo = (dir: string) =>
    existsSync(join(dir, "TASKS.md")) || existsSync(join(dir, ".tasksmd.json"));
  if (isRepo(root)) roots.push(root);
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return roots;
  }
  for (const entry of entries.sort()) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const child = join(root, entry);
    try {
      if (statSync(child).isDirectory() && isRepo(child)) roots.push(child);
    } catch {
      // ignore
    }
  }
  return roots;
}

/**
 * Gather open tasks across the selected workspaces, resolving EACH repo's
 * backend: markdown repos parse TASKS.md (full metadata); non-markdown repos
 * (git-native / github-issues) come through the backend's `listOpen`, so one
 * ranked list spans every backend kind.
 */
async function gatherEntries(
  selection: WorkspaceSelection,
): Promise<{ entries: UnifiedEntry[]; repoCount: number }> {
  const entries: UnifiedEntry[] = [];
  let repoCount = 0;
  for (let i = 0; i < selection.roots.length; i += 1) {
    const root = selection.roots[i];
    const workspaceName = selection.names[i] ?? basename(root);
    for (const repoRoot of discoverRepoRoots(root)) {
      repoCount += 1;
      const repoName = repoRoot === root ? "." : basename(repoRoot);
      const backend = resolveBackendConfig(repoRoot).backend;
      if (backend === "tasks-md") {
        const taskFile = join(repoRoot, "TASKS.md");
        if (!existsSync(taskFile)) continue;
        for (const task of parseTasksContent(readFileSync(taskFile, "utf-8"), taskFile)) {
          entries.push({
            id: task.metadata.id ?? task.summary,
            title: task.summary,
            priority: task.priority,
            assignee: task.claimed,
            blockedBy: task.metadata.blockedBy ?? [],
            blocked: task.metadata.blocked,
            standingLoop:
              task.metadata.id === "standing-audit-gap-loop" ||
              (task.metadata.tags ?? []).includes("standing-loop"),
            workspaceName,
            repoName,
            file: taskFile,
            line: task.startLine,
            backend,
          });
        }
      } else {
        // A non-markdown backend (git-native / github-issues) may be offline or
        // unauthenticated; skip that repo rather than failing the whole pick.
        let backendTasks: Awaited<ReturnType<ReturnType<typeof getBackend>["listOpen"]>> = [];
        try {
          backendTasks = await getBackend(repoRoot).listOpen();
        } catch {
          continue;
        }
        for (const task of backendTasks) {
          entries.push({
            id: task.id ?? task.title,
            title: task.title,
            priority: task.priority,
            assignee: task.assignee,
            blockedBy: [],
            standingLoop: (task.tags ?? []).includes("standing-loop"),
            workspaceName,
            repoName,
            file: join(repoRoot, "TASKS.md"),
            line: 0,
            backend,
          });
        }
      }
    }
  }
  return { entries, repoCount };
}

function blockerOpen(ref: string, all: UnifiedEntry[]): boolean {
  const parsed = parseBlockerRef(ref);
  return all.some(
    (e) =>
      e.id === parsed.taskId &&
      (!parsed.repo || e.repoName === parsed.repo) &&
      (!parsed.workspace || e.workspaceName === parsed.workspace),
  );
}

function isPickable(entry: UnifiedEntry, all: UnifiedEntry[]): boolean {
  if (entry.assignee) return false;
  if (entry.blocked && entry.blocked.trim()) return false;
  if (entry.standingLoop) return false;
  return !entry.blockedBy.some((ref) => blockerOpen(ref, all));
}

export interface WorkspacePick {
  entry: UnifiedEntry;
  /** `<workspace>::<repo>:<task-id>`. */
  ref: string;
}

export interface WorkspacePickResult {
  summary: string;
  pick?: WorkspacePick;
}

/** Aggregate across the selected workspaces (any backend) and pick the top task. */
export async function pickAcrossWorkspaces(
  selection: WorkspaceSelection,
): Promise<WorkspacePickResult> {
  const { entries, repoCount } = await gatherEntries(selection);
  const pickable = entries.filter((entry) => isPickable(entry, entries));
  const summary = `scanned ${selection.roots.length} workspace(s), ${repoCount} repo(s), ${pickable.length} unblocked`;

  pickable.sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    if (pr !== 0) return pr;
    return `${a.workspaceName}/${a.repoName}`.localeCompare(`${b.workspaceName}/${b.repoName}`);
  });
  const top = pickable[0];
  if (!top) {
    return { summary };
  }
  return { summary, pick: { entry: top, ref: `${top.workspaceName}::${top.repoName}:${top.id}` } };
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
