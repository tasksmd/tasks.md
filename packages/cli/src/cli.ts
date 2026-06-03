#!/usr/bin/env node

import { Command } from "commander";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import {
  loadAllTasks,
  pickBestTask,
  getQueueStats,
  getQueueDiff,
  listTasks,
} from "./lib.js";
import { initTaskQueue } from "./commands/init.js";
import { generateCommands } from "./commands/generate-commands.js";
import { installCommands, installPreCommitHook } from "./commands/install.js";
import { startWatching } from "./commands/watch.js";
import { runMigrate } from "./commands/migrate.js";
import { checkWorkPush } from "./backend/git-native.js";
import {
  pickAcrossWorkspaces,
  resolveWorkspaceSelection,
  runWorkspacesAdd,
  runWorkspacesDetect,
  runWorkspacesList,
} from "./commands/workspaces.js";
import {
  COMPACTION_SUGGESTED_AT,
  formatDoctorReport,
  runDoctor,
  runFleetCompact,
  runFleetInit,
  runFleetStats,
} from "./commands/fleet.js";
import { runSync } from "./sync/engine.js";
import { createGitHubSource } from "./sync/github.js";
import { createJiraSource } from "./sync/jira.js";
import { createLinearSource } from "./sync/linear.js";
import {
  formatClaimResult,
  formatOperationResult,
  getBackend,
  resolveBackendConfig,
} from "./backend/index.js";
import type { ActorOptions, BackendTask, OperationResult } from "./backend/index.js";


const pkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")
);

const program = new Command()
  .name("tasks")
  .description("Unified CLI for TASKS.md task queue management")
  .version(pkg.version);

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
      const commandsSourceDir = join(import.meta.dirname, "..");
      const installResult = installCommands(process.cwd(), commandsSourceDir, { all: false });
      for (const msg of installResult.messages) {
        console.log(msg);
      }
      if (installResult.installed.length > 0) {
        console.log(`✓ Installed for ${installResult.installed.length} agent(s)`);
      }
    }
    console.log("");
    console.log("✓ Task queue initialized. Add tasks with:");
    console.log("  ## P1");
    console.log("  - [ ] Your first task");
  });

// ── generate-commands (TypeScript-native) ──

program
  .command("generate-commands")
  .description("Regenerate agent command files from canonical sources")
  .action(() => {
    console.log("Generating commands from canonical sources...");
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
    console.log(`✓ ${result.generated.length} command files generated from commands/next-task.md, commands/lint-tasks.md, commands/setup.md, and commands/migrate.md`);
  });

// ── install (TypeScript-native) ──

program
  .command("install")
  .description("Install agent commands for detected IDEs")
  .option("--all", "Install for all agents (even if directories don't exist)")
  .option("--agent <name>", "Install for a specific agent only")
  .option("--hooks", "Install pre-commit hook that validates TASKS.md")
  .action((opts: { all?: boolean; agent?: string; hooks?: boolean }) => {
    const commandsSourceDir = join(import.meta.dirname, "..");
    console.log("Installing /next-task commands...");
    const result = installCommands(process.cwd(), commandsSourceDir, {
      all: opts.all,
      agent: opts.agent,
    });
    for (const message of result.messages) {
      console.log(message);
    }
    console.log("");
    if (result.installed.length === 0 && !opts.hooks) {
      console.log(`No agent directories detected in ${process.cwd()}`);
      console.log("Use --all to install for all agents, or create agent dirs first.");
    } else {
      console.log(`✓ Installed for ${result.installed.length} agent(s)`);
    }
    if (opts.hooks) {
      const hookResult = installPreCommitHook(process.cwd());
      console.log(hookResult.message);
    }
  });

// ── watch (TypeScript-native) ──

program
  .command("watch")
  .description("Watch TASKS.md files and auto-lint on change")
  .argument("[directory]", "Directory to watch", ".")
  .option("--fix", "Auto-fix removable issues on every save (e.g. completed tasks)")
  .action((directory: string, opts: { fix?: boolean }) => {
    const watchDir = join(process.cwd(), directory);
    startWatching(watchDir, { fix: Boolean(opts.fix) });
  });

// ── sync (unified) ──
//
// `tasks sync <provider>` is the canonical surface; the legacy commands
// `sync-issues`, `sync-jira`, and `sync-linear` are kept as deprecated aliases
// for one minor version and print a warning before forwarding to the same
// action handler. Provider-specific flags stay attached to the subcommand;
// the shared `--output` and `--merge` flags repeat per subcommand because
// Commander resolves option flags at the leaf command, not the parent.

interface GithubOpts { repo?: string; label?: string; output?: string; merge?: boolean }
interface JiraOpts { project?: string; jql?: string; output?: string; merge?: boolean; max?: string }
interface LinearOpts { team: string; project?: string; filter?: string; output?: string; merge?: boolean; max?: string }

async function runGithubSync(opts: GithubOpts): Promise<void> {
  const source = createGitHubSource({ repo: opts.repo, label: opts.label });
  await runSync(source, { output: opts.output, merge: opts.merge });
}

async function runJiraSync(opts: JiraOpts): Promise<void> {
  const source = createJiraSource({ project: opts.project, jql: opts.jql, maxResults: Number(opts.max) });
  await runSync(source, { output: opts.output, merge: opts.merge });
}

async function runLinearSync(opts: LinearOpts): Promise<void> {
  const source = createLinearSource({ team: opts.team, project: opts.project, filter: opts.filter, maxResults: Number(opts.max) });
  await runSync(source, { output: opts.output, merge: opts.merge });
}

const sync = program
  .command("sync")
  .description("Sync issues from an external tracker into TASKS.md");

sync
  .command("github")
  .description("Sync GitHub Issues into TASKS.md")
  .option("--repo <repo>", "GitHub repo (default: current repo from gh)")
  .option("--label <label>", "Issue label to filter by", "tasks.md")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .action(async (opts: GithubOpts) => { await runGithubSync(opts); });

sync
  .command("jira")
  .description("Sync Jira issues into TASKS.md")
  .option("--project <key>", "Jira project key")
  .option("--jql <query>", "Custom JQL query (overrides --project)")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: JiraOpts) => { await runJiraSync(opts); });

sync
  .command("linear")
  .description("Sync Linear issues into TASKS.md")
  .requiredOption("--team <key>", "Linear team key (e.g. ENG)")
  .option("--project <name>", "Filter by Linear project name")
  .option("--filter <json>", "Custom Linear issue filter as JSON")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: LinearOpts) => { await runLinearSync(opts); });

// ── deprecated sync aliases ──

function warnDeprecated(oldName: string, newName: string): void {
  console.error(`warning: tasks ${oldName} is deprecated; use tasks ${newName}`);
}

program
  .command("sync-issues", { hidden: true })
  .description("[deprecated] Use 'tasks sync github' instead")
  .option("--repo <repo>", "GitHub repo (default: current repo from gh)")
  .option("--label <label>", "Issue label to filter by", "tasks.md")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .action(async (opts: GithubOpts) => {
    warnDeprecated("sync-issues", "sync github");
    await runGithubSync(opts);
  });

program
  .command("sync-jira", { hidden: true })
  .description("[deprecated] Use 'tasks sync jira' instead")
  .option("--project <key>", "Jira project key")
  .option("--jql <query>", "Custom JQL query (overrides --project)")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: JiraOpts) => {
    warnDeprecated("sync-jira", "sync jira");
    await runJiraSync(opts);
  });

program
  .command("sync-linear", { hidden: true })
  .description("[deprecated] Use 'tasks sync linear' instead")
  .requiredOption("--team <key>", "Linear team key (e.g. ENG)")
  .option("--project <name>", "Filter by Linear project name")
  .option("--filter <json>", "Custom Linear issue filter as JSON")
  .option("--output <file>", "Output file (default: stdout)")
  .option("--merge", "Preserve existing manual tasks; only add/remove synced tasks")
  .option("--max <n>", "Maximum results to fetch", "200")
  .action(async (opts: LinearOpts) => {
    warnDeprecated("sync-linear", "sync linear");
    await runLinearSync(opts);
  });

// ── lint (removed) ──
//
// `tasks lint` was a duplicate surface for the same backend that
// `tasks-lint` (the @tasks-md/lint standalone binary) already exposes.
// To collapse to one canonical lint entry point we removed it; if you
// installed @tasks-md/cli only, lint via `npx @tasks-md/lint TASKS.md`
// (or install @tasks-md/lint to get the `tasks-lint` binary on PATH).
// The shared `lintFiles` backend in @tasks-md/lint is unchanged — both
// `tasks watch` and `tasks-lint` keep using it.

// ── pick ──
//
// `--json` keeps the same shape across all four read commands (pick / list /
// stats / diff) so any script can choose a command and parse its output with
// the same `JSON.parse(stdout)` call. The shape mirrors the historical
// implementation in commit a567140 — `{picked: false}` when the queue is
// empty, otherwise `{picked, summary, priority, file, line, metadata,
// candidates, unblocks}`.

program
  .command("pick")
  .alias("next")
  .description("Pick the best task to work on next")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--json", "Output as JSON for scripting")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--workspace <path|name>", "Pick within one workspace (path or config name)")
  .option("--workspaces <p1,p2,...>", "Pick across a comma-separated list of workspaces")
  .option("--workspace-name <name>", "Pick within a configured workspace by name")
  .action(
    async (opts: {
      tags?: string;
      json?: boolean;
      backend?: string;
      workspace?: string;
      workspaces?: string;
      workspaceName?: string;
    }) => {
      // Workspace mode: explicit --workspace* flags, or a configured set of
      // workspaces when no flag is given. Falls through to single-repo otherwise.
      const selection = resolveWorkspaceSelection(opts);
      if (selection) {
        const result = await pickAcrossWorkspaces(selection);
        if (opts.json) {
          console.log(
            JSON.stringify(
              result.pick
                ? {
                    picked: true,
                    workspace: result.pick.entry.workspaceName,
                    repo: result.pick.entry.repoName,
                    id: result.pick.entry.id,
                    summary: result.pick.entry.title,
                    priority: result.pick.entry.priority,
                    backend: result.pick.entry.backend,
                    file: result.pick.entry.file,
                    line: result.pick.entry.line,
                    ref: result.pick.ref,
                  }
                : { picked: false, summary: result.summary },
            ),
          );
        } else {
          console.error(result.summary);
          if (result.pick) {
            console.log(result.pick.ref);
            console.log(`  "${result.pick.entry.title}" (${result.pick.entry.priority})`);
            console.log(`  File: ${result.pick.entry.file}:${result.pick.entry.line}`);
          } else {
            console.log("No eligible tasks found across the selected workspaces.");
          }
        }
        if (!result.pick) process.exitCode = 1;
        return;
      }

      if (resolveBackendConfig(process.cwd(), opts.backend).backend !== "tasks-md") {
      const backend = getBackend(process.cwd(), opts.backend);
      const task = await pickFromBackend(backend, opts.tags);
      if (opts.json) {
        console.log(JSON.stringify(task ? { picked: true, ...task } : { picked: false }));
      } else if (task) {
        console.log(`Picked ${formatTask(task)}`);
        if (task.url) console.log(`  URL: ${task.url}`);
      } else {
        console.log("No eligible tasks found (all claimed or empty queue).");
      }
      return;
    }

    const taskFiles = loadAllTasks(process.cwd());
    const tags = opts.tags?.split(",").filter(Boolean);
    const result = pickBestTask(taskFiles, tags);

    if (!result) {
      if (opts.json) {
        console.log(JSON.stringify({ picked: false }));
      } else {
        console.log("No eligible tasks found (all claimed, blocked, or empty queue).");
      }
      return;
    }

    const { task, candidateCount, unblocksCount } = result;

    if (opts.json) {
      console.log(JSON.stringify({
        picked: true,
        summary: task.summary,
        priority: task.priority,
        file: task.file,
        line: task.startLine,
        metadata: task.metadata,
        candidates: candidateCount,
        unblocks: unblocksCount,
      }));
      return;
    }

    console.log(`Picked "${task.summary}" (${task.priority})`);
    console.log(`  File: ${task.file}:${task.startLine}`);
    if (task.metadata.id) console.log(`  ID: ${task.metadata.id}`);
    if (task.metadata.tags?.length) console.log(`  Tags: ${task.metadata.tags.join(", ")}`);
    // Print Details so agents calling `pick` for context have the full prose
    // without needing a follow-up file read at the reported file:line. Each
    // continuation line stays under the same 2-space indent as the rest of the
    // labeled fields. Skipped silently when the task has no Details metadata.
    if (task.metadata.details) {
      console.log(`  Details:`);
      for (const line of task.metadata.details.split("\n")) {
        console.log(`    ${line}`);
      }
    }
    if (unblocksCount > 0) console.log(`  Unblocks: ${unblocksCount} task(s)`);
    console.log(`  Candidates: ${candidateCount}`);
  });

// ── list ──
//
// CLI counterpart of the MCP `list_tasks` tool. Same filter predicates and
// sort order — see `lib.ts:listTasks` for the parity contract.

program
  .command("list")
  .description("List tasks matching priority/tag filters")
  .option("--priority <p>", "Filter by priority (P0, P1, P2, P3)")
  .option("--tag <tag>", "Filter by tag")
  .option("--unclaimed", "Only show unclaimed tasks")
  .option("--unblocked", "Only show unblocked tasks")
  .option("--json", "Output as JSON instead of tab-separated")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .action(async (opts: { priority?: string; tag?: string; unclaimed?: boolean; unblocked?: boolean; json?: boolean; backend?: string }) => {
    if (resolveBackendConfig(process.cwd(), opts.backend).backend !== "tasks-md") {
      const tasks = filterBackendTasks(await getBackend(process.cwd(), opts.backend).listOpen(), opts);
      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }
      if (tasks.length === 0) {
        console.log("No tasks match the filters.");
        return;
      }
      for (const t of tasks) console.log(`${t.priority}\t${t.id}\t${t.title}`);
      return;
    }

    const taskFiles = loadAllTasks(process.cwd());
    const tasks = listTasks(taskFiles, {
      priority: opts.priority,
      tag: opts.tag,
      unclaimedOnly: opts.unclaimed,
      unblockedOnly: opts.unblocked,
    });

    if (opts.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return;
    }

    if (tasks.length === 0) {
      console.log("No tasks match the filters.");
      return;
    }

    for (const t of tasks) {
      console.log(`${t.priority}\t${t.id ?? "-"}\t${t.summary}`);
    }
  });

// ── stats ──

program
  .command("stats")
  .description("Show task queue stats and throughput")
  .option("--json", "Output as JSON for scripting")
  .action((opts: { json?: boolean }) => {
    const stats = getQueueStats(process.cwd());

    if (opts.json) {
      console.log(JSON.stringify(stats));
      return;
    }

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
  .option("--json", "Output as JSON for scripting")
  .action((ref: string, opts: { json?: boolean }) => {
    const diff = getQueueDiff(process.cwd(), ref);

    if (opts.json) {
      console.log(JSON.stringify(diff));
      return;
    }

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

// ── backend-aware task ops (VISION.md G5: tasks-md | github-issues | git-native) ──
//
// These behave identically regardless of where the work lives. The backend
// is resolved from `.tasksmd.json` (default: tasks-md) and can be overridden
// per-invocation with `--backend`.

interface BackendOpts {
  backend?: string;
  as?: string;
  json?: boolean;
}

/** Actor identity for a mutating op: `--as`, else $TASKS_ACTOR / $TASKS_INSTANCE. */
function actorOptions(opts: BackendOpts): ActorOptions {
  return {
    actorId: opts.as ?? process.env.TASKS_ACTOR,
    instanceId: process.env.TASKS_INSTANCE,
  };
}

function formatTask(task: BackendTask): string {
  const idPart = task.id ? `${task.id} — ` : "";
  const claim = task.assignee ? ` (@${task.assignee})` : "";
  return `[${task.priority}] ${idPart}${task.title}${claim}`;
}

function filterBackendTasks(
  tasks: BackendTask[],
  opts: { priority?: string; tag?: string; unclaimed?: boolean },
): BackendTask[] {
  let filtered = tasks;
  if (opts.priority) {
    const priority = opts.priority.toUpperCase();
    filtered = filtered.filter((task) => task.priority.toUpperCase() === priority);
  }
  if (opts.tag) {
    const tag = opts.tag.toLowerCase();
    filtered = filtered.filter((task) =>
      task.tags.some((candidate) => candidate.toLowerCase() === tag),
    );
  }
  if (opts.unclaimed) {
    filtered = filtered.filter((task) => !task.assignee);
  }
  return filtered;
}

async function pickFromBackend(
  backend: ReturnType<typeof getBackend>,
  tagFilter?: string,
): Promise<BackendTask | null> {
  const requestedTags = tagFilter
    ?.split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (!requestedTags || requestedTags.length === 0) {
    return backend.next();
  }
  const candidates = (await backend.listOpen()).filter((task) => !task.assignee);
  const tagged = candidates.filter((task) =>
    task.tags.some((tag) => requestedTags.includes(tag.toLowerCase())),
  );
  return tagged[0] ?? candidates[0] ?? null;
}

program
  .command("create")
  .description("File a new task in the active backend")
  .argument("<title>", "Task title")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--priority <p>", "Priority: P0 | P1 | P2 | P3", "P2")
  .option("--body <text>", "Task body / details")
  .option("--tag <tag...>", "Label/tag (repeatable)")
  .option("--blocked <reason>", "Mark the task blocked with a reason")
  .option("--blocked-by <id...>", "Task ids this depends on (repeatable)")
  .option("--json", "Emit the created task as JSON")
  .action(
    async (
      title: string,
      opts: BackendOpts & {
        priority?: string;
        body?: string;
        tag?: string[];
        blocked?: string;
        blockedBy?: string[];
      },
    ) => {
      const task = await getBackend(process.cwd(), opts.backend).create(
        {
          title,
          priority: opts.priority,
          body: opts.body,
          tags: opts.tag,
          blocked: opts.blocked,
          blockedBy: opts.blockedBy,
        },
        actorOptions(opts),
      );
      if (opts.json) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.log(`Created ${task.url ?? task.id}: ${task.title}`);
      }
    },
  );

program
  .command("update")
  .description("Update a task's fields in the active backend")
  .argument("<id>", "Task id (issue number for github-issues)")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--title <text>", "New title")
  .option("--priority <p>", "New priority: P0 | P1 | P2 | P3")
  .option("--body <text>", "New body / details")
  .option("--tag <tag...>", "Replace tags (repeatable)")
  .option("--blocked <reason>", "Set the blocked reason (empty string clears it)")
  .option("--blocked-by <id...>", "Replace blocked-by task ids (repeatable)")
  .option("--json", "Emit the operation result as JSON")
  .action(
    async (
      id: string,
      opts: BackendOpts & {
        title?: string;
        priority?: string;
        body?: string;
        tag?: string[];
        blocked?: string;
        blockedBy?: string[];
      },
    ) => {
      const result = await getBackend(process.cwd(), opts.backend).update(
        id,
        {
          title: opts.title,
          priority: opts.priority,
          body: opts.body,
          tags: opts.tag,
          blocked: opts.blocked,
          blockedBy: opts.blockedBy,
        },
        actorOptions(opts),
      );
      emitOperationResult(result, opts);
    },
  );

program
  .command("claim")
  .description("Claim a task (assign it to you)")
  .argument("<id>", "Task id (issue number for github-issues)")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--json", "Emit the claim result as JSON")
  .action(async (id: string, opts: BackendOpts) => {
    const result = await getBackend(process.cwd(), opts.backend).claim(id, actorOptions(opts));
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatClaimResult(result));
    }
    if (result.status !== "claimed") process.exitCode = 1;
  });

program
  .command("unclaim")
  .description("Release a claimed task back to the queue")
  .argument("<id>", "Task id (issue number for github-issues)")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--json", "Emit the operation result as JSON")
  .action(async (id: string, opts: BackendOpts) => {
    const result = await getBackend(process.cwd(), opts.backend).release(id, actorOptions(opts));
    emitOperationResult(result, opts);
  });

program
  .command("complete")
  .description("Complete a task (close the issue / remove the TASKS.md block)")
  .argument("<id>", "Task id (issue number for github-issues)")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--json", "Emit the operation result as JSON")
  .action(async (id: string, opts: BackendOpts) => {
    const result = await getBackend(process.cwd(), opts.backend).complete(id, actorOptions(opts));
    emitOperationResult(result, opts);
  });

program
  .command("cancel")
  .description("Cancel a task without completing the work")
  .argument("<id>", "Task id (issue number for github-issues)")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--as <actor>", "Actor identity (defaults to $TASKS_ACTOR)")
  .option("--json", "Emit the operation result as JSON")
  .action(async (id: string, opts: BackendOpts) => {
    const result = await getBackend(process.cwd(), opts.backend).cancel(id, actorOptions(opts));
    emitOperationResult(result, opts);
  });

program
  .command("render")
  .description("Render the human-readable TASKS.md snapshot from the active backend")
  .option("--backend <kind>", "Override backend: tasks-md | github-issues | git-native")
  .option("--json", "Emit the render result as JSON")
  .action(async (opts: BackendOpts) => {
    const result = await getBackend(process.cwd(), opts.backend).render();
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.status === "ok") {
      process.stdout.write(result.content ?? "");
    } else {
      console.error(`render unsupported: ${result.reason ?? result.backend}`);
    }
    if (result.status !== "ok") process.exitCode = 1;
  });

program
  .command("migrate")
  .description("Migrate the file-backend TASKS.md into a git-native event log")
  .option("--apply", "Write the events + .tasksmd.json (default is a dry-run)")
  .action((opts: { apply?: boolean }) => {
    const result = runMigrate(process.cwd(), { apply: opts.apply });
    for (const line of result.lines) console.log(line);
  });

const fleet = program.command("fleet").description("Set up git-native fleet coordination");
fleet
  .command("init")
  .description("Install the agent-mediated fleet workflow in this repo (idempotent)")
  .option("--backend <kind>", "Backend to configure: git-native | tasks-md", "git-native")
  .option("--agent <name>", "Install commands for one agent (else auto-detect)")
  .option("--all", "Install commands for all six agents")
  .action((opts: { backend?: "git-native" | "tasks-md"; agent?: string; all?: boolean }) => {
    const result = runFleetInit(process.cwd(), opts);
    for (const line of result.lines) console.log(line);
  });
fleet
  .command("stats")
  .description("Report contention metrics for the git-native tasks-claims log")
  .action(() => {
    const report = runFleetStats(process.cwd());
    for (const line of report.lines) console.log(line);
  });
fleet
  .command("compact")
  .description("Rewrite the tasks-claims log to a fold-equivalent minimum and push it (lease-guarded)")
  .option("--threshold <n>", "Only compact when the log has at least N events", String(COMPACTION_SUGGESTED_AT))
  .option("--force", "Compact regardless of the threshold")
  .action((opts: { threshold?: string; force?: boolean }) => {
    const threshold = opts.threshold ? Number(opts.threshold) : undefined;
    for (const line of runFleetCompact(process.cwd(), { threshold, force: opts.force })) {
      console.log(line);
    }
  });

const workspaces = program
  .command("workspaces")
  .description("Manage multi-repo workspaces for cross-repo task aggregation");
workspaces
  .command("list")
  .description("List configured and auto-detected workspaces")
  .action(() => {
    for (const line of runWorkspacesList()) console.log(line);
  });
workspaces
  .command("add")
  .description("Add a workspace to the per-user config")
  .argument("<path>", "Workspace root directory")
  .option("--name <name>", "Workspace name (defaults to the directory name)")
  .action((path: string, opts: { name?: string }) => {
    for (const line of runWorkspacesAdd(path, opts.name)) console.log(line);
  });
workspaces
  .command("detect")
  .description("Scan for workspaces and print the ones found")
  .option("--scan-root <path>", "Directory to scan (defaults to config scanRoots / ~/apps)")
  .action((opts: { scanRoot?: string }) => {
    for (const line of runWorkspacesDetect(opts.scanRoot)) console.log(line);
  });

program
  .command("check-push")
  .description("Path-scoped claim gate: allow doc-only pushes, fence code by claim")
  .argument("<paths...>", "Changed file paths")
  .option("--task <id>", "Task id from the commit's Task: trailer")
  .option("--claim <claimId>", "Fencing token from the commit's Task-Claim: trailer")
  .action((paths: string[], opts: { task?: string; claim?: string }) => {
    const verdict = checkWorkPush(process.cwd(), {
      paths,
      taskId: opts.task,
      claimId: opts.claim,
    });
    if (verdict === "allowed") {
      console.log("allowed: doc-only change, or code change with a live matching claim.");
    } else {
      console.error(
        "rejected: this push changes non-markdown files without a live claim + matching Task-Claim token. Claim a task (`tasks claim <id>`) and add `Task:`/`Task-Claim:` commit trailers.",
      );
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Verify the fleet install: config, commands, hooks, claims ref, projection")
  .option("--quiet", "Print only on failure (exit nonzero if a check fails)")
  .action(async (opts: { quiet?: boolean }) => {
    const report = await runDoctor(process.cwd());
    if (!opts.quiet || !report.ok) {
      console.log(formatDoctorReport(report));
    }
    if (!report.ok) process.exitCode = 1;
  });

program.parse();

/** Print an operation result and set a nonzero exit code on anything but `ok`. */
function emitOperationResult(result: OperationResult, opts: BackendOpts): void {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatOperationResult(result));
  }
  if (result.status !== "ok" && result.status !== "noop") process.exitCode = 1;
}
