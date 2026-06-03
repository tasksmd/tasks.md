// Reads/writes the per-user workspace config at
// `$XDG_CONFIG_HOME/tasks-md/workspaces.yaml` (default `~/.config/...`), and
// resolves `--workspace*` flags into concrete workspace roots. See spec.md
// § "Multiple workspaces on one host".

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface WorkspaceEntry {
  name: string;
  root: string;
  exclude?: string[];
  priorityWeight?: number;
}

export interface WorkspaceDiscovery {
  scanRoots?: string[];
  autoDetect?: boolean;
}

export interface WorkspacesConfig {
  workspaces: WorkspaceEntry[];
  discovery?: WorkspaceDiscovery;
}

export function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "tasks-md", "workspaces.yaml");
}

export function loadWorkspacesConfig(path = configPath()): WorkspacesConfig | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const raw = parseYaml(readFileSync(path, "utf-8")) as Partial<WorkspacesConfig> | null;
    if (!raw || !Array.isArray(raw.workspaces)) {
      return undefined;
    }
    return {
      workspaces: raw.workspaces.map((entry) => ({
        ...entry,
        root: expandTilde(entry.root),
      })),
      discovery: raw.discovery,
    };
  } catch {
    return undefined;
  }
}

export function saveWorkspacesConfig(config: WorkspacesConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  // Persist roots with the user's `~` preserved where possible for portability.
  const home = homedir();
  const serializable: WorkspacesConfig = {
    workspaces: config.workspaces.map((entry) => ({
      ...entry,
      root: entry.root.startsWith(home) ? entry.root.replace(home, "~") : entry.root,
    })),
    ...(config.discovery ? { discovery: config.discovery } : {}),
  };
  writeFileSync(path, stringifyYaml(serializable));
}

export interface WorkspaceSelection {
  roots: string[];
  names: string[];
}

/**
 * Resolve which workspace roots a command should target, given CLI flags and
 * the config. Returns `undefined` to mean "no workspace mode — fall back to
 * single `./TASKS.md`" (backwards compat).
 */
export function resolveWorkspaceSelection(
  opts: { workspace?: string; workspaces?: string; workspaceName?: string },
  config = loadWorkspacesConfig(),
): WorkspaceSelection | undefined {
  if (opts.workspace) {
    const root = expandTilde(opts.workspace);
    const named = config?.workspaces.find((w) => w.name === opts.workspace);
    return named
      ? { roots: [named.root], names: [named.name] }
      : { roots: [resolve(root)], names: [baseName(root)] };
  }
  if (opts.workspaces) {
    const roots = opts.workspaces.split(",").map((p) => resolve(expandTilde(p.trim()))).filter(Boolean);
    return { roots, names: roots.map(baseName) };
  }
  if (opts.workspaceName) {
    const named = config?.workspaces.find((w) => w.name === opts.workspaceName);
    return named ? { roots: [named.root], names: [named.name] } : undefined;
  }
  // No explicit scope: aggregate across all configured workspaces if any.
  if (config && config.workspaces.length > 0) {
    return {
      roots: config.workspaces.map((w) => w.root),
      names: config.workspaces.map((w) => w.name),
    };
  }
  return undefined;
}

function baseName(path: string): string {
  const segments = resolve(path).split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
