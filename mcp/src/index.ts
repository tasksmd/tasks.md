#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadAllTasks,
  discoverTaskFiles,
} from "./parser.js";
import {
  listTasksFromFiles,
  claimTask,
  completeTask,
  addTask,
} from "./tools.js";

const server = new McpServer({
  name: "tasks-mcp",
  version: "0.1.0",
});

function getWorkingDirectory(): string {
  return process.env.TASKS_MCP_DIR || process.cwd();
}

// ── list_tasks ──

server.registerTool(
  "list_tasks",
  {
    title: "List Tasks",
    description:
      "List all tasks from TASKS.md files. Discovers files from git root down. " +
      "Returns structured task data with priority, tags, blockers, and claim status.",
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
    description:
      "Claim a task by appending (@agent-name) to the task line. " +
      "Identifies the task by summary substring or ID.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Task summary substring or task ID to match"
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

// ── complete_task ──

server.registerTool(
  "complete_task",
  {
    title: "Complete Task",
    description:
      "Remove a completed task from TASKS.md. " +
      "Identifies the task by summary substring or ID, then removes the entire task block.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Task summary substring or task ID to match"),
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

// ── add_task ──

server.registerTool(
  "add_task",
  {
    title: "Add Task",
    description:
      "Add a new task to TASKS.md under the specified priority heading. " +
      "Creates the priority section if it doesn't exist.",
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
      file: z
        .string()
        .optional()
        .describe("Target TASKS.md file path (defaults to root TASKS.md)"),
    }),
  },
  async ({ summary, priority, id, tags, details, files, acceptance, blocked_by, file }) => {
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
      summary, priority, id, tags, details, files, acceptance, blocked_by,
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
