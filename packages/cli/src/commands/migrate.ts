import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllTasks, type Task } from "@tasks-md/parser";
import {
  applyMigration,
  previewMigration,
  type MigrationEventPreview,
  type MigrationTask,
} from "../backend/git-native.js";

export interface MigrateOptions {
  /** Write events + config. Default is a dry-run preview. */
  apply?: boolean;
}

export interface MigrateResult {
  tasks: MigrationTask[];
  events: MigrationEventPreview[];
  applied: boolean;
  configPath: string;
  lines: string[];
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "task"
  );
}

function toMigrationTask(task: Task): MigrationTask {
  return {
    id: task.metadata.id ?? slugify(task.summary),
    title: task.summary,
    priority: task.priority,
    tags: task.metadata.tags ?? [],
    body: task.metadata.details,
    blocked: task.metadata.blocked,
    blockedBy: task.metadata.blockedBy,
    claimedBy: task.claimed?.replace(/^@/, ""),
  };
}

/**
 * Import the current file-backend `TASKS.md` queue into a git-native event log.
 * Dry-run by default: it returns the events that WOULD be appended and the
 * config that WOULD be written, without touching the repo. Pass `apply: true`
 * to write the log + `.tasksmd.json`.
 */
export function runMigrate(directory: string, options: MigrateOptions = {}): MigrateResult {
  const configPath = join(directory, ".tasksmd.json");
  const tasks = loadAllTasks(directory)
    .flatMap((file) => file.tasks)
    .map(toMigrationTask);

  // Throws on duplicate/missing ids — fail safely before any write.
  const events = previewMigration(tasks);

  const lines: string[] = [];
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8")) as { backend?: string };
      if (raw.backend === "git-native") {
        lines.push("⚠ .tasksmd.json already selects git-native — migration may duplicate events.");
      }
    } catch {
      // ignore unreadable config; the apply path will overwrite it
    }
  }

  lines.push(
    `Would migrate ${tasks.length} task(s) → ${events.length} event(s) on the tasks-claims log.`,
  );
  for (const task of tasks) {
    const owner = task.claimedBy ? ` (claimed by @${task.claimedBy})` : "";
    lines.push(`  [${task.priority}] ${task.id}: ${task.title}${owner}`);
  }
  lines.push(`Would write ${configPath} → { "backend": "git-native" }.`);
  lines.push(
    "Rollback: `rm .tasksmd.json` and `git update-ref -d refs/heads/tasks-claims` " +
      "to return to the file backend (TASKS.md is left untouched).",
  );

  if (!options.apply) {
    lines.unshift("DRY RUN — no changes written. Re-run with --apply to migrate.");
    return { tasks, events, applied: false, configPath, lines };
  }

  applyMigration(directory, tasks);
  const config = {
    backend: "git-native" as const,
    migratedFrom: "tasks-md",
    migratedAt: new Date().toISOString(),
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  lines.unshift(`Migrated ${tasks.length} task(s) to git-native and wrote ${configPath}.`);
  return { tasks, events, applied: true, configPath, lines };
}
