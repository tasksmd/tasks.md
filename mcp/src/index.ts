#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import {
  loadAllTasks,
  parseTaskFile,
  getAllTaskIds,
  isBlocked,
  discoverTaskFiles,
  type Task,
  type TaskFile,
} from "./parser.js";

const server = new McpServer({
  name: "tasks-mcp",
  version: "0.1.0",
});

function getWorkingDirectory(): string {
  return process.env.TASKS_MCP_DIR || process.cwd();
}

function formatTask(task: Task, allIds: Set<string>): Record<string, unknown> {
  return {
    summary: task.summary,
    priority: task.priority,
    claimed: task.claimed ?? null,
    blocked: isBlocked(task, allIds),
    metadata: task.metadata,
    subtasks: task.subtasks.length > 0 ? task.subtasks : undefined,
    file: task.file,
    line: task.startLine,
  };
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
    const allIds = getAllTaskIds(taskFiles);

    let allTasks: Task[] = taskFiles.flatMap((file) => file.tasks);

    if (priority) {
      allTasks = allTasks.filter(
        (task) => task.priority.toUpperCase() === priority.toUpperCase()
      );
    }

    if (tag) {
      allTasks = allTasks.filter((task) =>
        task.metadata.tags?.some(
          (t) => t.toLowerCase() === tag.toLowerCase()
        )
      );
    }

    if (unclaimed_only) {
      allTasks = allTasks.filter((task) => !task.claimed);
    }

    if (unblocked_only) {
      allTasks = allTasks.filter((task) => !isBlocked(task, allIds));
    }

    // Sort by priority (P0 first)
    allTasks.sort((a, b) => a.priority.localeCompare(b.priority));

    const formatted = allTasks.map((task) => formatTask(task, allIds));

    const summary =
      allTasks.length === 0
        ? "No tasks found matching the filters."
        : `Found ${allTasks.length} task(s) across ${taskFiles.length} file(s).`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ summary, tasks: formatted }, null, 2),
        },
      ],
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
    const queryLower = query.toLowerCase();

    let matchedTask: Task | undefined;
    for (const file of taskFiles) {
      for (const task of file.tasks) {
        if (
          task.metadata.id?.toLowerCase() === queryLower ||
          task.summary.toLowerCase().includes(queryLower)
        ) {
          matchedTask = task;
          break;
        }
      }
      if (matchedTask) break;
    }

    if (!matchedTask) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No task found matching "${query}".`,
          },
        ],
        isError: true,
      };
    }

    if (matchedTask.claimed) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${matchedTask.summary}" is already claimed by ${matchedTask.claimed}.`,
          },
        ],
        isError: true,
      };
    }

    const fileContent = await readFile(matchedTask.file, "utf-8");
    const lines = fileContent.split("\n");
    const taskLineIndex = matchedTask.startLine - 1;
    const taskLine = lines[taskLineIndex];

    // Append (@agent-name) to the task line
    const claimTag = `(@${agent_name.replace(/^@/, "")})`;
    lines[taskLineIndex] = taskLine + ` ${claimTag}`;

    await writeFile(matchedTask.file, lines.join("\n"), "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Claimed "${matchedTask.summary}" for ${claimTag} in ${matchedTask.file}:${matchedTask.startLine}`,
        },
      ],
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
    const queryLower = query.toLowerCase();

    let matchedTask: Task | undefined;
    for (const file of taskFiles) {
      for (const task of file.tasks) {
        if (
          task.metadata.id?.toLowerCase() === queryLower ||
          task.summary.toLowerCase().includes(queryLower)
        ) {
          matchedTask = task;
          break;
        }
      }
      if (matchedTask) break;
    }

    if (!matchedTask) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No task found matching "${query}".`,
          },
        ],
        isError: true,
      };
    }

    const fileContent = await readFile(matchedTask.file, "utf-8");
    const lines = fileContent.split("\n");

    // Remove lines from startLine to endLine (1-indexed)
    const startIndex = matchedTask.startLine - 1;
    const endIndex = matchedTask.endLine;

    // Also remove trailing blank line if present
    let removeEnd = endIndex;
    if (removeEnd < lines.length && lines[removeEnd]?.trim() === "") {
      removeEnd++;
    }

    lines.splice(startIndex, removeEnd - startIndex);

    await writeFile(matchedTask.file, lines.join("\n"), "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Removed "${matchedTask.summary}" (${matchedTask.priority}) from ${matchedTask.file} (lines ${matchedTask.startLine}-${matchedTask.endLine})`,
        },
      ],
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

    let fileContent: string;
    try {
      fileContent = await readFile(targetFile, "utf-8");
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `Cannot read ${targetFile}`,
          },
        ],
        isError: true,
      };
    }

    // Build the task block
    const taskLines: string[] = [`- [ ] ${summary}`];
    if (id) taskLines.push(`  - **ID**: ${id}`);
    if (tags) taskLines.push(`  - **Tags**: ${tags}`);
    if (details) taskLines.push(`  - **Details**: ${details}`);
    if (files) taskLines.push(`  - **Files**: ${files}`);
    if (acceptance) taskLines.push(`  - **Acceptance**: ${acceptance}`);
    if (blocked_by) taskLines.push(`  - **Blocked by**: ${blocked_by}`);
    const taskBlock = taskLines.join("\n");

    const normalizedPriority = priority.toUpperCase();
    const lines = fileContent.split("\n");

    // Find the insertion point — after the last task in the priority section
    let sectionStart = -1;
    let insertAt = -1;
    const priorityNum = parseInt(normalizedPriority.replace("P", ""), 10);

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^##\s+P([0-3])$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num === priorityNum) {
          sectionStart = i;
        } else if (sectionStart >= 0 && num > priorityNum) {
          // Found the next section — insert before it
          // Back up past blank lines
          insertAt = i;
          while (insertAt > 0 && lines[insertAt - 1]?.trim() === "") {
            insertAt--;
          }
          break;
        }
      }
    }

    if (sectionStart >= 0 && insertAt < 0) {
      // Section exists but no following section — append at end
      insertAt = lines.length;
      while (insertAt > 0 && lines[insertAt - 1]?.trim() === "") {
        insertAt--;
      }
    }

    if (sectionStart < 0) {
      // Priority section doesn't exist — create it
      // Find where to insert the new section (after lower-priority sections or at end)
      let insertSectionAt = lines.length;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^##\s+P([0-3])$/);
        if (match && parseInt(match[1], 10) > priorityNum) {
          insertSectionAt = i;
          break;
        }
      }
      const sectionBlock = `\n## ${normalizedPriority}\n\n${taskBlock}\n`;
      lines.splice(insertSectionAt, 0, sectionBlock);
    } else {
      lines.splice(insertAt, 0, taskBlock + "\n");
    }

    await writeFile(targetFile, lines.join("\n"), "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Added "${summary}" (${normalizedPriority}) to ${targetFile}`,
        },
      ],
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
