import { readFile, writeFile } from "node:fs/promises";
import {
  loadAllTasks,
  parseTasksContent,
  getAllTaskIds,
  isBlocked,
  countUnblocks,
  pickBestTask,
  discoverTaskFiles,
  type Task,
  type TaskFile,
} from "./parser.js";

export interface ToolResult {
  text: string;
  isError?: boolean;
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

export interface ListTasksOptions {
  priority?: string;
  tag?: string;
  unclaimed_only?: boolean;
  unblocked_only?: boolean;
}

export function listTasksFromFiles(
  taskFiles: TaskFile[],
  options: ListTasksOptions = {}
): ToolResult {
  const allIds = getAllTaskIds(taskFiles);

  let allTasks: Task[] = taskFiles.flatMap((file) => file.tasks);

  if (options.priority) {
    allTasks = allTasks.filter(
      (task) => task.priority.toUpperCase() === options.priority!.toUpperCase()
    );
  }

  if (options.tag) {
    allTasks = allTasks.filter((task) =>
      task.metadata.tags?.some(
        (t) => t.toLowerCase() === options.tag!.toLowerCase()
      )
    );
  }

  if (options.unclaimed_only) {
    allTasks = allTasks.filter((task) => !task.claimed);
  }

  if (options.unblocked_only) {
    allTasks = allTasks.filter((task) => !isBlocked(task, allIds));
  }

  allTasks.sort((a, b) => a.priority.localeCompare(b.priority));

  const formatted = allTasks.map((task) => formatTask(task, allIds));

  const summary =
    allTasks.length === 0
      ? "No tasks found matching the filters."
      : `Found ${allTasks.length} task(s) across ${taskFiles.length} file(s).`;

  return { text: JSON.stringify({ summary, tasks: formatted }, null, 2) };
}

// ── claim_task ──

function findTask(taskFiles: TaskFile[], query: string): Task | undefined {
  const queryLower = query.toLowerCase();
  for (const file of taskFiles) {
    for (const task of file.tasks) {
      if (
        task.metadata.id?.toLowerCase() === queryLower ||
        task.summary.toLowerCase().includes(queryLower)
      ) {
        return task;
      }
    }
  }
  return undefined;
}

export async function claimTask(
  taskFiles: TaskFile[],
  query: string,
  agentName: string
): Promise<ToolResult> {
  const matchedTask = findTask(taskFiles, query);

  if (!matchedTask) {
    return { text: `No task found matching "${query}".`, isError: true };
  }

  if (matchedTask.claimed) {
    return {
      text: `Task "${matchedTask.summary}" is already claimed by ${matchedTask.claimed}.`,
      isError: true,
    };
  }

  const fileContent = await readFile(matchedTask.file, "utf-8");
  const lines = fileContent.split("\n");
  const taskLineIndex = matchedTask.startLine - 1;
  const taskLine = lines[taskLineIndex];

  const claimTag = `(@${agentName.replace(/^@/, "")})`;
  lines[taskLineIndex] = taskLine + ` ${claimTag}`;

  await writeFile(matchedTask.file, lines.join("\n"), "utf-8");

  return {
    text: `Claimed "${matchedTask.summary}" for ${claimTag} in ${matchedTask.file}:${matchedTask.startLine}`,
  };
}

// ── unclaim_task ──

export async function unclaimTask(
  taskFiles: TaskFile[],
  query: string
): Promise<ToolResult> {
  const matchedTask = findTask(taskFiles, query);

  if (!matchedTask) {
    return { text: `No task found matching "${query}".`, isError: true };
  }

  if (!matchedTask.claimed) {
    return {
      text: `Task "${matchedTask.summary}" is not claimed by anyone.`,
      isError: true,
    };
  }

  const fileContent = await readFile(matchedTask.file, "utf-8");
  const lines = fileContent.split("\n");
  const taskLineIndex = matchedTask.startLine - 1;
  const taskLine = lines[taskLineIndex];

  // Remove the claim tag: " (@agent-name)" or " (@agent-name - in progress)"
  lines[taskLineIndex] = taskLine.replace(/\s+\(@[^)]+\)\s*$/, "");

  await writeFile(matchedTask.file, lines.join("\n"), "utf-8");

  return {
    text: `Unclaimed "${matchedTask.summary}" (was ${matchedTask.claimed}) in ${matchedTask.file}:${matchedTask.startLine}`,
  };
}

// ── complete_task ──

export async function completeTask(
  taskFiles: TaskFile[],
  query: string
): Promise<ToolResult> {
  const matchedTask = findTask(taskFiles, query);

  if (!matchedTask) {
    return { text: `No task found matching "${query}".`, isError: true };
  }

  const fileContent = await readFile(matchedTask.file, "utf-8");
  const lines = fileContent.split("\n");

  const startIndex = matchedTask.startLine - 1;
  const endIndex = matchedTask.endLine;

  let removeEnd = endIndex;
  if (removeEnd < lines.length && lines[removeEnd]?.trim() === "") {
    removeEnd++;
  }

  lines.splice(startIndex, removeEnd - startIndex);

  await writeFile(matchedTask.file, lines.join("\n"), "utf-8");

  return {
    text: `Removed "${matchedTask.summary}" (${matchedTask.priority}) from ${matchedTask.file} (lines ${matchedTask.startLine}-${matchedTask.endLine})`,
  };
}

// ── pick_task ──

export interface PickTaskOptions {
  tags?: string[];
  agent_name?: string;
}

export async function pickTask(
  taskFiles: TaskFile[],
  options: PickTaskOptions = {}
): Promise<ToolResult> {
  const result = pickBestTask(taskFiles, options.tags, options.agent_name);

  if (!result) {
    return {
      text: JSON.stringify({
        summary: "No eligible tasks found (all claimed, blocked, or empty queue).",
        task: null,
      }, null, 2),
    };
  }

  const allIds = getAllTaskIds(taskFiles);
  const formatted = formatTask(result.task, allIds);

  if (result.resumed) {
    const normalizedName = (options.agent_name ?? "").replace(/^@/, "").toLowerCase();
    return {
      text: JSON.stringify({
        summary: `Resuming previously claimed "${result.task.summary}" (${result.task.priority}) for @${normalizedName}.`,
        task: formatted,
        resumed: true,
      }, null, 2),
    };
  }

  if (options.agent_name) {
    await claimTask(taskFiles, result.task.metadata.id || result.task.summary, options.agent_name);
    formatted.claimed = `@${options.agent_name.replace(/^@/, "")}`;
  }

  return {
    text: JSON.stringify({
      summary: `Picked "${result.task.summary}" (${result.task.priority}) — unblocks ${result.unblocksCount} other task(s).${options.agent_name ? ` Claimed for @${options.agent_name.replace(/^@/, "")}.` : ""}`,
      task: formatted,
      candidates_count: result.candidateCount,
    }, null, 2),
  };
}

// ── add_task ──

export interface AddTaskParams {
  summary: string;
  priority?: string;
  id?: string;
  tags?: string;
  details?: string;
  files?: string;
  acceptance?: string;
  blocked_by?: string;
  /**
   * Free-form reason why the task is blocked by an external constraint
   * (missing approval, refused policy, credentials, etc.). Distinct from
   * blocked_by, which references other task IDs. Any non-empty value marks
   * the task as blocked for picking purposes.
   */
  blocked?: string;
}

const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);

export async function addTask(
  targetFile: string,
  params: AddTaskParams
): Promise<ToolResult> {
  const normalizedPriority = (params.priority || "P2").toUpperCase();
  if (!VALID_PRIORITIES.has(normalizedPriority)) {
    return { text: `Invalid priority '${params.priority}' — must be P0, P1, P2, or P3`, isError: true };
  }

  if (params.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.id)) {
    return { text: `Invalid ID '${params.id}' — must be kebab-case (lowercase letters, numbers, hyphens)`, isError: true };
  }

  let fileContent: string;
  try {
    fileContent = await readFile(targetFile, "utf-8");
  } catch {
    return { text: `Cannot read ${targetFile}`, isError: true };
  }

  const normalizedTags = params.tags
    ? params.tags.split(",").map((t) => t.trim().toLowerCase()).join(", ")
    : undefined;

  const taskLines: string[] = [`- [ ] ${params.summary}`];
  if (params.id) taskLines.push(`  - **ID**: ${params.id}`);
  if (normalizedTags) taskLines.push(`  - **Tags**: ${normalizedTags}`);
  if (params.details) taskLines.push(`  - **Details**: ${params.details}`);
  if (params.files) taskLines.push(`  - **Files**: ${params.files}`);
  if (params.acceptance) taskLines.push(`  - **Acceptance**: ${params.acceptance}`);
  if (params.blocked_by) taskLines.push(`  - **Blocked by**: ${params.blocked_by}`);
  if (params.blocked && params.blocked.trim() !== "") {
    taskLines.push(`  - **Blocked**: ${params.blocked.trim()}`);
  }
  const taskBlock = taskLines.join("\n");
  const lines = fileContent.split("\n");

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
        insertAt = i;
        while (insertAt > 0 && lines[insertAt - 1]?.trim() === "") {
          insertAt--;
        }
        break;
      }
    }
  }

  if (sectionStart >= 0 && insertAt < 0) {
    insertAt = lines.length;
    while (insertAt > 0 && lines[insertAt - 1]?.trim() === "") {
      insertAt--;
    }
  }

  if (sectionStart < 0) {
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

  return { text: `Added "${params.summary}" (${normalizedPriority}) to ${targetFile}` };
}
