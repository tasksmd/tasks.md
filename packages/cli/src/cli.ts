#!/usr/bin/env node

import { Command } from "commander";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { lintFiles, discoverFiles } from "tasks-lint";
import {
  loadAllTasks,
  pickBestTask,
  getQueueStats,
  getQueueDiff,
} from "./lib.js";
import { initTaskQueue } from "./commands/init.js";
import { generateCommands } from "./commands/generate-commands.js";
import { runSync } from "./sync/engine.js";
import { createGitHubSource } from "./sync/github.js";
import { createJiraSource } from "./sync/jira.js";
import { createLinearSource } from "./sync/linear.js";

const SCRIPTS_DIR = join(import.meta.dirname, "..", "..", "..", "scripts");

function rawArgsAfter(commandName: string): string[] {
  const idx = process.argv.indexOf(commandName);
  return idx >= 0 ? process.argv.slice(idx + 1) : [];
}

function delegateToScript(script: string, args: string[]): void {
  try {
    execFileSync("bash", [join(SCRIPTS_DIR, script), ...args], {
      stdio: "inherit",
    });
  } catch (error: unknown) {
    process.exit((error as { status?: number }).status ?? 1);
  }
}

const program = new Command()
  .name("tasks")
  .description("Unified CLI for TASKS.md task queue management")
  .version("0.1.0");

// ── init (TypeScript-native) ──

program
  .command("init")
  .description("Initialize a task queue in the current repo")
  .option("--install", "Also install /next-task for detected agents")
  .action((opts: { install?: boolean }) => {
    const result = initTaskQueue(process.cwd());
    for (const message of result.messages) {
      console.log(message);
    }
    if (opts.install) {
      delegateToScript("install.sh", [process.cwd()]);
    }
    console.log("");
    console.log("✓ Task queue initialized. Add tasks with:");
    console.log("  ## P1");
    console.log("  - [ ] Your first task");
  });

// ── generate-commands (TypeScript-native) ──

program
  .command("generate-commands")
  .description("Regenerate agent command files from canonical source")
  .action(() => {
    console.log("Generating commands from canonical source...");
    const result = generateCommands(process.cwd());
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`Error: ${error}`);
      }
      process.exit(1);
    }
    for (const message of result.messages) {
      console.log(message);
    }
    console.log("");
    console.log(`✓ All ${result.generated.length} command files generated from commands/next-task.md`);
  });

// ── Delegate commands (bash scripts) ──

for (const { name, description, script, prependCwd } of [
  { name: "install", description: "Install /next-task for detected agents", script: "install.sh", prependCwd: true },
  { name: "watch", description: "Watch TASKS.md files and auto-lint on change", script: "watch.sh", prependCwd: false },
]) {
  program
    .command(name)
    .description(description)
    .allowUnknownOption()
    .allowExcessArguments()
    .action(() => {
      const args = rawArgsAfter(name);
      delegateToScript(script, prependCwd ? [process.cwd(), ...args] : args);
    });
}

// ── sync-issues ──

program
  .command("sync-issues")
  .description("Sync GitHub Issues into TASKS.md")
  .option("--repo <repo>", "GitHub repo (default: current repo from gh)")
  .option("--label <label>", "Issue label to filter by", "tasks.md")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .action(async (opts: { repo?: string; label?: string; output?: string; merge?: boolean }) => {
    const source = createGitHubSource({ repo: opts.repo, label: opts.label });
    await runSync(source, { output: opts.output, merge: opts.merge });
  });

// ── sync-jira ──

program
  .command("sync-jira")
  .description("Sync Jira issues into TASKS.md")
  .option("--project <key>", "Jira project key")
  .option("--jql <query>", "Custom JQL query (overrides --project)")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: { project?: string; jql?: string; output?: string; merge?: boolean; max?: string }) => {
    const source = createJiraSource({ project: opts.project, jql: opts.jql, maxResults: Number(opts.max) });
    await runSync(source, { output: opts.output, merge: opts.merge });
  });

// ── sync-linear ──

program
  .command("sync-linear")
  .description("Sync Linear issues into TASKS.md")
  .requiredOption("--team <key>", "Linear team key (e.g. ENG)")
  .option("--project <name>", "Filter by Linear project name")
  .option("--filter <json>", "Custom Linear issue filter as JSON")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: { team: string; project?: string; filter?: string; output?: string; merge?: boolean; max?: string }) => {
    const source = createLinearSource({ team: opts.team, project: opts.project, filter: opts.filter, maxResults: Number(opts.max) });
    await runSync(source, { output: opts.output, merge: opts.merge });
  });

// ── lint ──

program
  .command("lint")
  .description("Validate TASKS.md files against the spec")
  .option("--fix", "Auto-fix removable issues (completed tasks)")
  .argument("<paths...>", "Files or directories to lint")
  .action((paths: string[], opts: { fix?: boolean }) => {
    const allFiles = paths.flatMap(discoverFiles);
    if (allFiles.length === 0) {
      console.error("No .md files found in the specified paths.");
      process.exit(2);
    }
    const { errors, fixed, filesChecked } = lintFiles(allFiles, Boolean(opts.fix));
    console.log("");
    if (opts.fix && fixed > 0) {
      console.log(`Checked ${filesChecked} file(s), fixed ${fixed} issue(s), ${errors} remaining error(s)`);
    } else {
      console.log(`Checked ${filesChecked} file(s), found ${errors} error(s)`);
    }
    process.exit(errors > 0 ? 1 : 0);
  });

// ── pick ──

program
  .command("pick")
  .description("Pick the best task to work on next")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .action((opts: { tags?: string }) => {
    const taskFiles = loadAllTasks(process.cwd());
    const tags = opts.tags?.split(",").filter(Boolean);
    const result = pickBestTask(taskFiles, tags);

    if (!result) {
      console.log("No eligible tasks found (all claimed, blocked, or empty queue).");
      return;
    }

    const { task, candidateCount, unblocksCount } = result;
    console.log(`Picked "${task.summary}" (${task.priority})`);
    console.log(`  File: ${task.file}:${task.startLine}`);
    if (task.metadata.id) console.log(`  ID: ${task.metadata.id}`);
    if (task.metadata.tags?.length) console.log(`  Tags: ${task.metadata.tags.join(", ")}`);
    if (unblocksCount > 0) console.log(`  Unblocks: ${unblocksCount} task(s)`);
    console.log(`  Candidates: ${candidateCount}`);
  });

// ── stats ──

program
  .command("stats")
  .description("Show task queue stats and throughput")
  .action(() => {
    const stats = getQueueStats(process.cwd());

    console.log("📋 Queue Overview");
    console.log("");
    console.log("  P0   P1   P2   P3   Total");
    console.log(
      `  ${String(stats.byPriority.P0).padEnd(4)} ${String(stats.byPriority.P1).padEnd(4)} ${String(stats.byPriority.P2).padEnd(4)} ${String(stats.byPriority.P3).padEnd(4)} ${stats.total}`
    );
    console.log("");
    console.log(`  Blocked: ${stats.blocked}`);
    console.log(`  Claimed: ${stats.claimed}`);
    console.log(`  Available: ${stats.available}`);
    console.log(`  Files: ${stats.fileCount}`);
    console.log("");
    console.log("📊 Throughput");
    console.log("");
    console.log(`  Completed (all time):  ${stats.throughput.total}`);
    console.log(`  Completed (this month): ${stats.throughput.month}`);
    console.log(`  Completed (this week):  ${stats.throughput.week}`);

    if (stats.topAgents.length > 0) {
      console.log("");
      console.log("  Top agents:");
      for (const { agent, count } of stats.topAgents) {
        console.log(`    @${agent}: ${count} task(s)`);
      }
    }
  });

// ── diff ──

program
  .command("diff")
  .description("Show queue changes since last commit")
  .argument("[ref]", "Git reference to compare against", "HEAD")
  .action((ref: string) => {
    const diff = getQueueDiff(process.cwd(), ref);

    if (!diff.hasChanges) {
      console.log(`No TASKS.md changes since ${ref}`);
      return;
    }

    console.log(`📋 Queue Changes (since ${ref})`);
    console.log("");

    if (diff.removed.length > 0) {
      console.log(`  ✅ Removed (${diff.removed.length}):`);
      for (const task of diff.removed) console.log(`    ${task}`);
      console.log("");
    }

    if (diff.added.length > 0) {
      console.log(`  ➕ Added (${diff.added.length}):`);
      for (const task of diff.added) console.log(`    ${task}`);
      console.log("");
    }

    if (diff.claimed.length > 0) {
      console.log(`  🔒 Claimed (${diff.claimed.length}):`);
      for (const task of diff.claimed) console.log(`    ${task}`);
      console.log("");
    }

    console.log(
      `  Summary: +${diff.added.length} added, -${diff.removed.length} removed, ${diff.claimed.length} claimed`
    );
  });

program.parse();
