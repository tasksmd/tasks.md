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
  /**
   * Free-form research notes accumulated by agents while the task is
   * blocked. Distinct from `details` (author intent). Multi-line values are
   * supported via the usual continuation indentation.
   */
  research?: string;
  /**
   * ISO date (YYYY-MM-DD) marking the last time an agent enriched the task.
   * Used as an idempotency / cooldown gate for /next-task's enrichment loop.
   */
  last_enriched?: string;
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
  if (params.research && params.research.trim() !== "") {
    taskLines.push(`  - **Research**: ${params.research.trim()}`);
  }
  if (params.last_enriched && params.last_enriched.trim() !== "") {
    const trimmed = params.last_enriched.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { text: `Invalid last_enriched '${params.last_enriched}' — must be an ISO date (YYYY-MM-DD)`, isError: true };
    }
    taskLines.push(`  - **Last-enriched**: ${trimmed}`);
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

// ── enrich_task ──

export interface EnrichTaskParams {
  /** Research notes to append under a dated subheading (`YYYY-MM-DD — <label>`). */
  research: string;
  /**
   * Optional ISO date to stamp as Last-enriched. Defaults to today's UTC date.
   * Must match YYYY-MM-DD if provided.
   */
  date?: string;
  /** Optional short label appended to the dated subheading (e.g. "draft message"). */
  label?: string;
  /** Optional file paths to append to **Files** (comma-separated). */
  add_files?: string;
  /** Optional acceptance lines to append to **Acceptance** (single string, newlines preserved). */
  add_acceptance?: string;
}

function isoDateToday(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function indentResearch(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
}

/**
 * Append research notes to a task block without touching its **Blocked** or
 * **Blocked by** lines. Stamps **Last-enriched** with today's UTC date (or the
 * caller-provided `date`). Rewrites the task block in place.
 *
 * Rules enforced:
 * - The referenced task must exist (matched by ID or summary substring).
 * - `research` must be non-empty; whitespace-only values are rejected.
 * - `date`, when provided, must match YYYY-MM-DD.
 * - The task's existing **Blocked** / **Blocked by** lines are never moved or rewritten.
 */
export async function enrichTask(
  taskFiles: TaskFile[],
  query: string,
  params: EnrichTaskParams
): Promise<ToolResult> {
  const matchedTask = findTask(taskFiles, query);

  if (!matchedTask) {
    return { text: `No task found matching "${query}".`, isError: true };
  }

  const research = (params.research ?? "").trim();
  if (research === "") {
    return { text: "enrich_task requires non-empty research notes.", isError: true };
  }

  const date = (params.date ?? isoDateToday()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { text: `Invalid date '${params.date}' — must be an ISO date (YYYY-MM-DD)`, isError: true };
  }

  const fileContent = await readFile(matchedTask.file, "utf-8");
  const lines = fileContent.split("\n");

  const startIndex = matchedTask.startLine - 1;
  const endIndex = matchedTask.endLine;

  // Detect the block's nested-list indent ("  " by default for metadata lines).
  let listIndent = "  ";
  for (let i = startIndex + 1; i < endIndex; i++) {
    const match = lines[i].match(/^(\s+)-\s+\*\*/);
    if (match) {
      listIndent = match[1];
      break;
    }
  }
  const continuationIndent = `${listIndent}  `;
  const researchLineIndex = (() => {
    for (let i = startIndex + 1; i < endIndex; i++) {
      if (new RegExp(`^${listIndent}-\\s+\\*\\*Research\\*\\*:`).test(lines[i])) {
        return i;
      }
    }
    return -1;
  })();
  const lastEnrichedLineIndex = (() => {
    for (let i = startIndex + 1; i < endIndex; i++) {
      if (new RegExp(`^${listIndent}-\\s+\\*\\*Last-enriched\\*\\*:`).test(lines[i])) {
        return i;
      }
    }
    return -1;
  })();

  // Build the new research block content. When **Research** already exists we
  // append a new dated subheading after a visual blank line; when it's fresh
  // the first dated heading goes on the same line as the **Research**: label
  // (the parser requires a non-empty first line per metadata field).
  const heading = params.label ? `${date} — ${params.label.trim()}` : date;
  const bodyLines = research.split("\n");
  const indentedBody = bodyLines
    .map((line) => (line.length > 0 ? `${continuationIndent}${line}` : line))
    .join("\n");

  const updatedLines = [...lines];

  if (researchLineIndex >= 0) {
    // Find the end of the existing Research field (last continuation line).
    let researchEnd = researchLineIndex;
    for (let i = researchLineIndex + 1; i < endIndex; i++) {
      const line = lines[i];
      if (
        line.trim() === "" ||
        /^\s*-\s+\*\*/.test(line) ||
        /^\s*-\s+\[.\]/.test(line) ||
        !/^\s{4,}/.test(line)
      ) {
        break;
      }
      researchEnd = i;
    }
    // Append a blank indented line + heading + body after the existing block.
    // The blank line is a visual separator only — the parser drops blank
    // lines between continuation lines, so the stored `research` value still
    // flows as a single multi-section string.
    const insertion = ["", `${continuationIndent}${heading}`, indentedBody];
    updatedLines.splice(researchEnd + 1, 0, ...insertion);
  } else {
    // Fresh Research — put the heading inline with the field label.
    const researchHeader = `${listIndent}- **Research**: ${heading}`;
    const insertion = indentedBody.length > 0
      ? [researchHeader, indentedBody]
      : [researchHeader];
    updatedLines.splice(endIndex, 0, ...insertion);
  }

  // Update or append Last-enriched.
  const lastEnrichedLine = `${listIndent}- **Last-enriched**: ${date}`;
  if (lastEnrichedLineIndex >= 0) {
    // The index may have shifted if we inserted Research lines before it.
    const shift = updatedLines.length - lines.length;
    const adjusted = lastEnrichedLineIndex > (researchLineIndex >= 0 ? researchLineIndex : endIndex)
      ? lastEnrichedLineIndex + shift
      : lastEnrichedLineIndex;
    updatedLines[adjusted] = lastEnrichedLine;
  } else {
    // Append Last-enriched at the current end of the block.
    let insertAt = endIndex;
    const shift = updatedLines.length - lines.length;
    insertAt += shift;
    updatedLines.splice(insertAt, 0, lastEnrichedLine);
  }

  // Optional: extend Files by appending new paths (dedup against existing).
  if (params.add_files && params.add_files.trim() !== "") {
    const newPaths = params.add_files
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (newPaths.length > 0) {
      const existingFiles = matchedTask.metadata.files ?? [];
      const merged = [...existingFiles];
      for (const path of newPaths) {
        const normalized = path.replace(/`/g, "");
        if (!merged.includes(normalized)) merged.push(normalized);
      }
      const filesValue = merged.map((p) => `\`${p}\``).join(", ");
      const filesRegex = new RegExp(`^${listIndent}-\\s+\\*\\*Files\\*\\*:`);
      const filesLineIndex = updatedLines.findIndex((line, i) =>
        i > startIndex && filesRegex.test(line)
      );
      const newFilesLine = `${listIndent}- **Files**: ${filesValue}`;
      if (filesLineIndex >= 0) {
        updatedLines[filesLineIndex] = newFilesLine;
      } else {
        // Insert the new Files line before any Blocked / Research /
        // Last-enriched lines (and before Acceptance, which typically sits
        // near the end of author metadata). This keeps author-intent fields
        // (ID, Tags, Details, Files, Acceptance) contiguous at the top of
        // the block and agent-managed fields at the bottom.
        const anchorRegex = new RegExp(
          `^${listIndent}-\\s+\\*\\*(Acceptance|Blocked by|Blocked|Research|Last-enriched)\\*\\*:`
        );
        let anchor = updatedLines.findIndex((line, i) =>
          i > startIndex && anchorRegex.test(line)
        );
        if (anchor < 0) anchor = startIndex + 1;
        updatedLines.splice(anchor, 0, newFilesLine);
      }
    }
  }

  // Optional: append new acceptance lines under the existing Acceptance block
  // (or create the field when missing). We preserve author phrasing; the
  // agent adds its own bullets or sentences.
  if (params.add_acceptance && params.add_acceptance.trim() !== "") {
    const acceptanceBlock = indentResearch(params.add_acceptance.trim(), continuationIndent);
    const acceptanceRegex = new RegExp(`^${listIndent}-\\s+\\*\\*Acceptance\\*\\*:`);
    const acceptanceLineIndex = updatedLines.findIndex((line, i) =>
      i > startIndex && acceptanceRegex.test(line)
    );
    if (acceptanceLineIndex >= 0) {
      // Find end of acceptance block, append new lines.
      let acceptanceEnd = acceptanceLineIndex;
      for (let i = acceptanceLineIndex + 1; i < updatedLines.length; i++) {
        const line = updatedLines[i];
        if (
          line.trim() === "" ||
          /^\s*-\s+\*\*/.test(line) ||
          /^\s*-\s+\[.\]/.test(line) ||
          !/^\s{4,}/.test(line)
        ) {
          break;
        }
        acceptanceEnd = i;
      }
      updatedLines.splice(acceptanceEnd + 1, 0, acceptanceBlock);
    } else {
      updatedLines.splice(
        startIndex + 1,
        0,
        `${listIndent}- **Acceptance**:`,
        acceptanceBlock
      );
    }
  }

  await writeFile(matchedTask.file, updatedLines.join("\n"), "utf-8");

  return {
    text: `Enriched "${matchedTask.summary}" (${matchedTask.priority}) with research notes in ${matchedTask.file} (last-enriched: ${date})`,
  };
}
