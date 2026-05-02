export interface TaskMetadata {
  id?: string;
  tags?: string[];
  details?: string;
  files?: string[];
  acceptance?: string;
  blockedBy?: string[];
  /**
   * Free-form reason why the task is blocked by an external constraint
   * (e.g. "needs-user-approval — ..."). Distinct from blockedBy, which
   * references other task IDs. Any non-empty value marks the task as
   * blocked for task-picking purposes.
   */
  blocked?: string;
  /**
   * Free-form research notes accumulated by agents while the task is
   * blocked. Distinct from `details` (author intent) so reviewers can tell
   * what came from the agent. Multiline values are supported through the
   * usual continuation indentation.
   */
  research?: string;
  /**
   * ISO date (YYYY-MM-DD) marking the last time an agent enriched the task.
   * Used as an idempotency / cooldown gate so agents don't re-enrich the
   * same task every session.
   */
  lastEnriched?: string;
  [key: string]: string | string[] | undefined;
}

export interface Task {
  summary: string;
  priority: string;
  claimed?: string;
  metadata: TaskMetadata;
  subtasks: string[];
  file: string;
  startLine: number;
  endLine: number;
  rawLines: string[];
}

export interface Policy {
  text: string;
  scope: "file" | string; // "file" for file-level, or "P0"/"P1"/etc. for section-level
}

export interface TaskFile {
  path: string;
  tasks: Task[];
  policies?: Policy[];
}

function parseClaimant(summary: string): { cleanSummary: string; claimed?: string } {
  const match = summary.match(/\((@[\w-]+(?:\s*-\s*in progress)?)\)\s*$/);
  if (match) {
    return {
      cleanSummary: summary.slice(0, match.index).trim(),
      claimed: match[1],
    };
  }
  return { cleanSummary: summary };
}

function parseMetadataValue(key: string, value: string): string | string[] {
  const listKeys = ["tags", "files", "blockedby"];
  if (listKeys.includes(key.toLowerCase().replace(/\s+/g, ""))) {
    return value.split(",").map((item) => item.replace(/`/g, "").trim());
  }
  return value;
}

const POLICY_PATTERN = /policy\s*:\s*(.+)/gi;

/** Extract policy directives from HTML comments in a TASKS.md file. */
export function parsePolicies(content: string): Policy[] {
  const policies: Policy[] = [];
  const lines = content.split("\n");
  let currentScope: "file" | string = "file";
  let inComment = false;
  let commentBuffer = "";

  for (const line of lines) {
    // Track priority sections to determine scope
    const priorityMatch = line.match(/^##\s+P([0-3])$/);
    if (priorityMatch) {
      currentScope = `P${priorityMatch[1]}`;
      continue;
    }

    // Track HTML comments (may span multiple lines)
    if (line.includes("<!--")) {
      inComment = true;
      commentBuffer = "";
    }
    if (inComment) {
      commentBuffer += line + "\n";
    }
    if (line.includes("-->")) {
      inComment = false;
      // Extract all policy: directives from the comment block
      let match;
      POLICY_PATTERN.lastIndex = 0;
      while ((match = POLICY_PATTERN.exec(commentBuffer)) !== null) {
        const text = match[1].trim().replace(/\s*-->$/, "").trim();
        if (text) {
          policies.push({ text, scope: currentScope });
        }
      }
      commentBuffer = "";
    }
  }

  return policies;
}

export function parseTasksContent(content: string, filePath: string): Task[] {
  const lines = content.split("\n");
  const tasks: Task[] = [];
  let currentPriority = "";
  let currentTask: Task | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Priority heading
    const priorityMatch = line.match(/^##\s+P([0-3])$/);
    if (priorityMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = undefined;
      currentPriority = `P${priorityMatch[1]}`;
      continue;
    }

    // Top-level task (checkbox)
    const taskMatch = line.match(/^-\s+\[\s?\]\s+(.+)$/);
    if (taskMatch && currentPriority) {
      if (currentTask) tasks.push(currentTask);
      const { cleanSummary, claimed } = parseClaimant(taskMatch[1]);
      currentTask = {
        summary: cleanSummary,
        priority: currentPriority,
        claimed,
        metadata: {},
        subtasks: [],
        file: filePath,
        startLine: i + 1,
        endLine: i + 1,
        rawLines: [line],
      };
      continue;
    }

    // Metadata or subtask under current task
    if (currentTask && line.match(/^\s{2,}/)) {
      currentTask.endLine = i + 1;
      currentTask.rawLines.push(line);

      // Metadata: "  - **Key**: value"
      const metaMatch = line.match(/^\s+-\s+\*\*(.+?)\*\*:\s*(.+)$/);
      if (metaMatch) {
        const key = metaMatch[1];
        const value = metaMatch[2];
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "");

        switch (normalizedKey) {
          case "id":
            currentTask.metadata.id = value;
            break;
          case "tags":
            currentTask.metadata.tags = parseMetadataValue("tags", value) as string[];
            break;
          case "details":
            currentTask.metadata.details = value;
            break;
          case "files":
            currentTask.metadata.files = parseMetadataValue("files", value) as string[];
            break;
          case "acceptance":
            currentTask.metadata.acceptance = value;
            break;
          case "blockedby":
            currentTask.metadata.blockedBy = parseMetadataValue("blockedby", value) as string[];
            break;
          case "blocked":
            currentTask.metadata.blocked = value;
            break;
          case "research":
            currentTask.metadata.research = value;
            break;
          case "last-enriched":
          case "lastenriched":
            currentTask.metadata.lastEnriched = value;
            break;
          default:
            currentTask.metadata[normalizedKey] = parseMetadataValue(normalizedKey, value);
        }
        continue;
      }

      // Continuation of multiline metadata
      const continuationMatch = line.match(/^\s{4,}(.+)$/);
      if (continuationMatch) {
        // Append to the last string metadata field
        const lastKey = Object.keys(currentTask.metadata).pop();
        if (lastKey && typeof currentTask.metadata[lastKey] === "string") {
          currentTask.metadata[lastKey] += "\n" + continuationMatch[1];
        }
        continue;
      }

      // Subtask: "  - [ ] subtask text"
      const subtaskMatch = line.match(/^\s+-\s+\[.\]\s+(.+)$/);
      if (subtaskMatch) {
        currentTask.subtasks.push(subtaskMatch[1]);
      }
      continue;
    }

    // Non-indented, non-heading line ends current task
    if (currentTask && line.trim() === "") {
      continue; // blank lines within task block are ok
    }
    if (currentTask && !line.match(/^\s/) && !line.match(/^##/) && line.trim() !== "") {
      tasks.push(currentTask);
      currentTask = undefined;
    }
  }

  if (currentTask) tasks.push(currentTask);
  return tasks;
}

export function getAllTaskIds(taskFiles: TaskFile[]): Set<string> {
  const ids = new Set<string>();
  for (const file of taskFiles) {
    for (const task of file.tasks) {
      if (task.metadata.id) ids.add(task.metadata.id);
    }
  }
  return ids;
}

export function isBlocked(task: Task, allIds: Set<string>): boolean {
  // Free-form reason blocker (external constraint) — any non-empty value blocks.
  if (task.metadata.blocked && task.metadata.blocked.trim() !== "") return true;
  if (!task.metadata.blockedBy?.length) return false;
  return task.metadata.blockedBy.some((id) => allIds.has(id));
}

// ── Targeted task ID lookup (shared by CLI and MCP) ──

/**
 * Normalize a task ID for exact comparison: trim whitespace, then strip a
 * single pair of surrounding backticks (e.g. ``"`my-id`"`` → `"my-id"`),
 * and trim again. Comparison stays case-sensitive — IDs are kebab-case by
 * convention, and case-insensitive matching is left to callers.
 */
export function normalizeTaskId(taskId: string): string {
  return taskId.trim().replace(/^`([^`]+)`$/, "$1").trim();
}

/**
 * Find every task whose `**ID**:` exactly equals `taskId` after both sides
 * are run through {@link normalizeTaskId}. Useful for `/next-task <task-id>`,
 * `pick_task` with a `task_id` argument, and any tooling that needs to
 * route a request to one specific task without falling back to fuzzy
 * summary matching.
 */
export function findTasksById(taskFiles: TaskFile[], taskId: string): Task[] {
  const normalizedQueryId = normalizeTaskId(taskId);
  return taskFiles.flatMap((file) =>
    file.tasks.filter((task) => {
      const id = task.metadata.id;
      return id !== undefined && normalizeTaskId(id) === normalizedQueryId;
    })
  );
}

// ── Task picking utilities (shared by CLI and MCP) ──

/** Count how many other tasks this task unblocks by completing. */
export function countUnblocks(task: Task, allTasks: Task[]): number {
  if (!task.metadata.id) return 0;
  return allTasks.filter((t) =>
    t.metadata.blockedBy?.includes(task.metadata.id!)
  ).length;
}

/** Count how many of the task's tags match the preferred tags list. */
export function tagOverlapCount(task: Task, tags: string[]): number {
  if (!task.metadata.tags?.length) return 0;
  return task.metadata.tags.filter((t) =>
    tags.some((at) => at.toLowerCase() === t.toLowerCase())
  ).length;
}

export interface PickResult {
  task: Task;
  candidateCount: number;
  unblocksCount: number;
  resumed?: boolean;
}

/**
 * Pick the highest-priority unblocked, unclaimed task using a deterministic algorithm.
 * Walks P0-P3, skips blocked/claimed, scores by unblocking impact then tag overlap.
 */
export function pickBestTask(
  taskFiles: TaskFile[],
  tags?: string[],
  agentName?: string
): PickResult | undefined {
  const allIds = getAllTaskIds(taskFiles);
  const allTasks = taskFiles.flatMap((f) => f.tasks);

  // Resume prior claim if agent already has one
  if (agentName) {
    const normalizedAgent = agentName.replace(/^@/, "").toLowerCase();
    const priorClaim = allTasks.find(
      (t) =>
        t.claimed?.replace(/^@/, "").toLowerCase().startsWith(normalizedAgent) &&
        !isBlocked(t, allIds)
    );
    if (priorClaim) {
      return {
        task: priorClaim,
        candidateCount: 1,
        unblocksCount: countUnblocks(priorClaim, allTasks),
        resumed: true,
      };
    }
  }

  let candidates = allTasks.filter(
    (t) => !t.claimed && !isBlocked(t, allIds)
  );

  if (tags?.length) {
    const filtered = candidates.filter((t) =>
      t.metadata.tags?.some((tag) =>
        tags.some((at) => at.toLowerCase() === tag.toLowerCase())
      )
    );
    if (filtered.length > 0) candidates = filtered;
  }

  if (candidates.length === 0) return undefined;

  const sortTags = tags ?? [];
  candidates.sort((a, b) => {
    const priorityDiff = a.priority.localeCompare(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const unblockDiff = countUnblocks(b, allTasks) - countUnblocks(a, allTasks);
    if (unblockDiff !== 0) return unblockDiff;
    return tagOverlapCount(b, sortTags) - tagOverlapCount(a, sortTags);
  });

  const picked = candidates[0];
  return {
    task: picked,
    candidateCount: candidates.length,
    unblocksCount: countUnblocks(picked, allTasks),
  };
}

export {
  findGitRoot,
  discoverTaskFiles,
  loadAllTasks,
  loadAllTasksAsync,
} from "./discovery.js";
