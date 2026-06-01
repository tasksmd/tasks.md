import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findGitRoot } from "./parser.js";

export type BackendKind = "tasks-md" | "github-issues";

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
  return value === "tasks-md" || value === "github-issues";
}

/**
 * Resolve the task backend for `directory`. Precedence (highest wins):
 *   1. `.tasksmd.json` at the git root (or `directory` if not in a repo)
 *   2. default: `tasks-md`
 *
 * `tasks-md` is the canonical default so existing repos are unaffected.
 */
export function resolveBackend(directory: string): BackendConfig {
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

  const chosen = raw.backend ?? "tasks-md";
  if (!isBackendKind(chosen)) {
    throw new Error(
      `Unknown task backend "${chosen}". Use "tasks-md" or "github-issues".`,
    );
  }

  return {
    backend: chosen,
    repo: raw.repo,
    label: raw.label ?? DEFAULT_LABEL,
  };
}

/**
 * Run the `tasks` CLI with the given arguments in the specified working directory.
 * Prefers a local `node_modules/.bin/tasks`, falls back to `npx -y @tasks-md/cli`.
 * Throws a clear error if execution fails.
 */
export function runTasksCli(args: string[], cwd: string): string {
  const localBinary = join(cwd, "node_modules", ".bin", "tasks");
  const useLocal = existsSync(localBinary);

  try {
    if (useLocal) {
      return execFileSync(localBinary, args, {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      }).trim();
    } else {
      return execFileSync("npx", ["-y", "@tasks-md/cli", ...args], {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      }).trim();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`tasks CLI failed: ${message}`);
  }
}

/**
 * Build the `tasks list` argv for the github-issues delegation. Emits only
 * flags the CLI's `list` command supports; the repo is resolved by the CLI
 * from `.tasksmd.json` at the same cwd, so no `--repo` is passed.
 */
export function buildListArgs(opts: {
  priority?: string;
  tag?: string;
  unclaimed_only?: boolean;
  unblocked_only?: boolean;
}): string[] {
  const args = ["list", "--json"];
  if (opts.priority) args.push("--priority", opts.priority);
  if (opts.tag) args.push("--tag", opts.tag);
  if (opts.unclaimed_only) args.push("--unclaimed");
  if (opts.unblocked_only) args.push("--unblocked");
  return args;
}

/** Build the `tasks pick` argv. `pick` supports only `--tags`/`--json`. */
export function buildPickArgs(opts: { tags?: string }): string[] {
  const args = ["pick", "--json"];
  if (opts.tags) args.push("--tags", opts.tags);
  return args;
}
