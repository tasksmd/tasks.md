#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadAllTasks,
  discoverTaskFiles,
} from "./parser.js";
import {
  listTasksFromFiles,
  claimTask,
  unclaimTask,
  completeTask,
  addTask,
  pickTask,
  enrichTask,
  TOOL_DESCRIPTIONS,
} from "./tools.js";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")
);

const server = new McpServer({
  name: "tasks-mcp",
  version: pkg.version,
});

function getWorkingDirectory(): string {
  return process.env.TASKS_MCP_DIR || process.cwd();
}

// ── list_tasks ──

server.registerTool(
  "list_tasks",
  {
    title: "List Tasks",
    description: TOOL_DESCRIPTIONS.list_tasks,
    inputSchema: z.object({
      priority: z
        .string()
        .optional()
        .describe("Filter by priority (P0, P1, P2, P3)"),
      tag: z.string().optional().describe("Filter by tag"),
      unclaimed_only: z
        .boolean()
        .optional()
        .describe("Only show unclaimed tasks"),
      unblocked_only: z
        .boolean()
        .optional()
        .describe("Only show unblocked tasks"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ priority, tag, unclaimed_only, unblocked_only }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const result = listTasksFromFiles(taskFiles, { priority, tag, unclaimed_only, unblocked_only });

    return {
      content: [{ type: "text" as const, text: result.text }],
    };
  }
);

// ── claim_task ──

server.registerTool(
  "claim_task",
  {
    title: "Claim Task",
    description: TOOL_DESCRIPTIONS.claim_task,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Task ID or summary substring to match. Exact IDs win before summary matches."
        ),
      agent_name: z
        .string()
        .describe("Agent name to claim with (e.g. 'cascade', 'cursor')"),
    }),
  },
  async ({ query, agent_name }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const result = await claimTask(taskFiles, query, agent_name);

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── unclaim_task ──

server.registerTool(
  "unclaim_task",
  {
    title: "Unclaim Task",
    description: TOOL_DESCRIPTIONS.unclaim_task,
    inputSchema: z.object({
      query: z
        .string()
        .describe("Task ID or summary substring to match. Exact IDs win before summary matches."),
    }),
  },
  async ({ query }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const result = await unclaimTask(taskFiles, query);

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── complete_task ──

server.registerTool(
  "complete_task",
  {
    title: "Complete Task",
    description: TOOL_DESCRIPTIONS.complete_task,
    inputSchema: z.object({
      query: z
        .string()
        .describe("Task ID or summary substring to match. Exact IDs win before summary matches."),
    }),
  },
  async ({ query }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const result = await completeTask(taskFiles, query);

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── pick_task ──

server.registerTool(
  "pick_task",
  {
    title: "Pick Task",
    description: TOOL_DESCRIPTIONS.pick_task,
    inputSchema: z.object({
      task_id: z
        .string()
        .optional()
        .describe(
          "Exact **ID** metadata value to target. When set, priority ordering and tags are ignored."
        ),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags to prefer (e.g. 'tooling,mcp'). Falls back to all if no match."),
      agent_name: z
        .string()
        .optional()
        .describe("Agent name to auto-claim the picked task (e.g. 'cascade', 'cursor'). If omitted, task is not claimed."),
    }),
    annotations: { readOnlyHint: false },
  },
  async ({ task_id, tags, agent_name }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const parsedTags = tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const result = await pickTask(taskFiles, { task_id, tags: parsedTags, agent_name });

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── add_task ──

server.registerTool(
  "add_task",
  {
    title: "Add Task",
    description: TOOL_DESCRIPTIONS.add_task,
    inputSchema: z.object({
      summary: z.string().describe("Task summary (one line)"),
      priority: z
        .string()
        .default("P2")
        .describe("Priority level: P0, P1, P2, or P3"),
      id: z.string().optional().describe("Task ID (kebab-case)"),
      tags: z.string().optional().describe("Comma-separated tags"),
      details: z.string().optional().describe("Task details"),
      files: z.string().optional().describe("Comma-separated file paths"),
      acceptance: z.string().optional().describe("Acceptance criteria"),
      blocked_by: z
        .string()
        .optional()
        .describe("Comma-separated task IDs this is blocked by"),
      blocked: z
        .string()
        .optional()
        .describe(
          "Free-form reason why the task is blocked by an external constraint " +
          "(e.g. 'needs-user-approval — posting publicly as the user needs approval'). " +
          "Distinct from blocked_by, which references task IDs. Any non-empty value " +
          "marks the task as blocked for picking purposes."
        ),
      research: z
        .string()
        .optional()
        .describe(
          "Free-form research notes (distinct from details, which is the author's " +
          "intent). Agents accumulate research in this field while the task is " +
          "blocked so future sessions or humans inherit the context."
        ),
      last_enriched: z
        .string()
        .optional()
        .describe(
          "ISO date (YYYY-MM-DD) marking the last time an agent enriched the task. " +
          "/next-task uses this as a cooldown so it does not re-enrich the same " +
          "task every session."
        ),
      file: z
        .string()
        .optional()
        .describe("Target TASKS.md file path (defaults to root TASKS.md)"),
    }),
  },
  async ({ summary, priority, id, tags, details, files, acceptance, blocked_by, blocked, research, last_enriched, file }) => {
    const directory = getWorkingDirectory();
    const targetFile = file || discoverTaskFiles(directory)[0];

    if (!targetFile) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No TASKS.md file found. Create one with '# Tasks' header first.",
          },
        ],
        isError: true,
      };
    }

    const result = await addTask(targetFile, {
      summary, priority, id, tags, details, files, acceptance, blocked_by, blocked, research, last_enriched,
    });

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── enrich_task ──

server.registerTool(
  "enrich_task",
  {
    title: "Enrich Task",
    description: TOOL_DESCRIPTIONS.enrich_task,
    inputSchema: z.object({
      query: z
        .string()
        .describe("Task ID or summary substring to match. Exact IDs win before summary matches."),
      research: z
        .string()
        .describe(
          "Research notes to append. Multi-line values are supported — the tool " +
          "indents the body beneath a dated subheading automatically."
        ),
      date: z
        .string()
        .optional()
        .describe(
          "ISO date (YYYY-MM-DD) to use for **Last-enriched** and the Research " +
          "subheading. Defaults to today's UTC date."
        ),
      label: z
        .string()
        .optional()
        .describe(
          "Short label appended to the dated subheading (e.g. 'draft message', " +
          "'consumer sketch'). Helps reviewers scan accumulated research."
        ),
      add_files: z
        .string()
        .optional()
        .describe(
          "Comma-separated file paths to append to **Files** (dedup against " +
          "existing entries). Backticks are optional — the tool adds them."
        ),
      add_acceptance: z
        .string()
        .optional()
        .describe(
          "Additional acceptance criteria to append to **Acceptance**. Multi-line " +
          "values are supported. Author-written lines are preserved."
        ),
    }),
  },
  async ({ query, research, date, label, add_files, add_acceptance }) => {
    const directory = getWorkingDirectory();
    const taskFiles = await loadAllTasks(directory);
    const result = await enrichTask(taskFiles, query, {
      research, date, label, add_files, add_acceptance,
    });

    return {
      content: [{ type: "text" as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  }
);

// ── Start server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
