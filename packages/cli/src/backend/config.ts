import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findGitRoot } from "@tasks-md/parser";

export type BackendKind = "tasks-md" | "github-issues" | "git-native";

export interface BackendConfig {
  backend: BackendKind;
  /** owner/repo for github-issues; omit to use the current dir's repo. */
  repo?: string;
  /** Marker label for github-issues. Default "tasks.md". */
  label: string;
}

const CONFIG_FILE = ".tasksmd.json";
const DEFAULT_LABEL = "tasks.md";

interface RawConfig {
  backend?: string;
  repo?: string;
  label?: string;
}

function isBackendKind(value: string): value is BackendKind {
  return value === "tasks-md" || value === "github-issues" || value === "git-native";
}

/**
 * Resolve the task backend for `directory`. Precedence (highest wins):
 *   1. `override` (e.g. a `--backend` CLI flag)
 *   2. `.tasksmd.json` at the git root (or `directory` if not in a repo)
 *   3. default: `tasks-md`
 *
 * `tasks-md` is the canonical default so existing repos are unaffected
 * (VISION.md G5 — file-first).
 */
export function resolveBackendConfig(
  directory: string,
  override?: string,
): BackendConfig {
  let root = directory;
  try {
    root = findGitRoot(directory);
  } catch {
    // not a git repo — fall back to the directory itself
  }

  let raw: RawConfig = {};
  const configPath = join(root, CONFIG_FILE);
  if (existsSync(configPath)) {
    try {
      raw = JSON.parse(readFileSync(configPath, "utf-8")) as RawConfig;
    } catch {
      throw new Error(`${CONFIG_FILE} is not valid JSON (at ${configPath})`);
    }
  }

  const chosen = override ?? raw.backend ?? "tasks-md";
  if (!isBackendKind(chosen)) {
    throw new Error(
      `Unknown task backend "${chosen}". Use "tasks-md", "github-issues", or "git-native".`,
    );
  }

  return {
    backend: chosen,
    repo: raw.repo,
    label: raw.label ?? DEFAULT_LABEL,
  };
}
