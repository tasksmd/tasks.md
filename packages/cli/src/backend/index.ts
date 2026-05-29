import { type BackendConfig, resolveBackendConfig } from "./config.js";
import { createGitHubIssuesBackend } from "./github-issues.js";
import { createTasksMdBackend } from "./tasks-md.js";
import type { TaskBackend } from "./types.js";

/** Instantiate the backend described by `config`, rooted at `directory`. */
export function createBackend(
  config: BackendConfig,
  directory: string,
): TaskBackend {
  if (config.backend === "github-issues") {
    return createGitHubIssuesBackend({ repo: config.repo, label: config.label });
  }
  return createTasksMdBackend(directory);
}

/**
 * Convenience: resolve the configured backend for `directory` (honoring an
 * optional `--backend` override) and return a ready-to-use instance.
 */
export function getBackend(directory: string, override?: string): TaskBackend {
  return createBackend(resolveBackendConfig(directory, override), directory);
}

export { resolveBackendConfig } from "./config.js";
export type { BackendConfig, BackendKind } from "./config.js";
export type { BackendTask, CreateTaskInput, TaskBackend } from "./types.js";
