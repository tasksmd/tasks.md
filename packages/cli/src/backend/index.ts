import { type BackendConfig, resolveBackendConfig } from "./config.js";
import { createGitNativeBackend } from "./git-native.js";
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
  if (config.backend === "git-native") {
    return createGitNativeBackend(directory);
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
export { renderGitNativeSnapshot } from "./git-native.js";
export {
  formatClaimResult,
  formatOperationResult,
  unsupportedResult,
} from "./types.js";
export type {
  ActorOptions,
  BackendCapabilities,
  BackendTask,
  ClaimTaskOptions,
  ClaimTaskResult,
  CreateTaskInput,
  OperationResult,
  OperationStatus,
  RenderResult,
  TaskBackend,
  TaskOperation,
  UpdateTaskInput,
} from "./types.js";
