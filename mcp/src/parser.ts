import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

export interface TaskMetadata {
  id?: string;
  tags?: string[];
  details?: string;
  files?: string[];
  acceptance?: string;
  blockedBy?: string[];
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

export interface TaskFile {
  path: string;
  tasks: Task[];
}

function findGitRoot(startDir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return startDir;
  }
}

export function discoverTaskFiles(directory: string): string[] {
  const gitRoot = findGitRoot(directory);
  try {
    const output = execSync(
      'fd --no-ignore-vcs -t f "^TASKS\\.md$"',
      { cwd: gitRoot, encoding: "utf-8" }
    ).trim();
    if (!output) return [];
    return output.split("\n").map((file) => join(gitRoot, file));
  } catch {
    // fd not available — check root only
    return [join(gitRoot, "TASKS.md")];
  }
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

export async function parseTaskFile(filePath: string): Promise<TaskFile> {
  const content = await readFile(filePath, "utf-8");
  return {
    path: filePath,
    tasks: parseTasksContent(content, filePath),
  };
}

export async function loadAllTasks(directory: string): Promise<TaskFile[]> {
  const files = discoverTaskFiles(directory);
  const results: TaskFile[] = [];
  for (const file of files) {
    try {
      results.push(await parseTaskFile(file));
    } catch {
      // Skip files that can't be read
    }
  }
  return results;
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
  if (!task.metadata.blockedBy?.length) return false;
  return task.metadata.blockedBy.some((id) => allIds.has(id));
}

export function getRelativePath(filePath: string, baseDir: string): string {
  return relative(baseDir, filePath);
}
