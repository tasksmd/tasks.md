import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Task,
  findTasksById,
  getAllTaskIds,
  isBlocked,
  loadAllTasks,
  pickBestTask,
} from "@tasks-md/parser";
import {
  type BackendTask,
  type CreateTaskInput,
  type TaskBackend,
  sortByPriority,
} from "./types.js";

function toTask(task: Task): BackendTask {
  return {
    id: task.metadata.id ?? "",
    title: task.summary,
    priority: task.priority,
    tags: task.metadata.tags ?? [],
    assignee: task.claimed?.replace(/^@/, ""),
    body: task.metadata.details,
  };
}

/**
 * Local TASKS.md backend — the canonical, file-first default (VISION.md G5).
 * Reads delegate to the parser's deterministic picker so `next` matches the
 * `/next-task` workflow exactly. Writes append to / prune from the root
 * `TASKS.md`.
 */
export function createTasksMdBackend(directory: string): TaskBackend {
  const tasksFile = join(directory, "TASKS.md");

  return {
    name: "TASKS.md",

    async listOpen(): Promise<BackendTask[]> {
      const taskFiles = loadAllTasks(directory);
      const allIds = getAllTaskIds(taskFiles);
      const open = taskFiles
        .flatMap((f) => f.tasks)
        .filter((t) => !t.claimed && !isBlocked(t, allIds));
      return sortByPriority(open.map(toTask));
    },

    async next(): Promise<BackendTask | null> {
      const picked = pickBestTask(loadAllTasks(directory));
      return picked ? toTask(picked.task) : null;
    },

    async create(input: CreateTaskInput): Promise<BackendTask> {
      const priority = (input.priority ?? "P2").toUpperCase();
      const id = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      const block = [
        `- [ ] ${input.title}`,
        `  - **ID**: ${id}`,
        `  - **Tags**: ${[priority.toLowerCase(), ...(input.tags ?? [])].join(", ")}`,
        ...(input.body ? [`  - **Details**: ${input.body}`] : []),
        "",
      ].join("\n");

      const header = `## ${priority}`;
      let content = existsSync(tasksFile)
        ? readFileSync(tasksFile, "utf-8")
        : "# Tasks\n\n## P0\n\n## P1\n\n## P2\n\n## P3\n";
      if (content.includes(header)) {
        // insert right after the priority header (+ its blank line)
        content = content.replace(`${header}\n\n`, `${header}\n\n${block}\n`);
      } else {
        content = `${content.trimEnd()}\n\n${header}\n\n${block}\n`;
      }
      writeFileSync(tasksFile, content);
      return { id, title: input.title, priority, tags: input.tags ?? [], body: input.body };
    },

    async claim(id: string): Promise<void> {
      // Claiming a TASKS.md task is an inline `(@id)` suffix; left to the
      // agent workflow (the parser reads it). No-op here keeps the backend
      // surface uniform without guessing the claimant identity.
      const taskFiles = loadAllTasks(directory);
      if (findTasksById(taskFiles, id).length === 0) {
        throw new Error(`No TASKS.md task with id "${id}".`);
      }
    },

    async complete(id: string): Promise<void> {
      const taskFiles = loadAllTasks(directory);
      const matches = findTasksById(taskFiles, id);
      if (matches.length === 0) {
        throw new Error(`No TASKS.md task with id "${id}".`);
      }
      // Remove the task's block from its file (history lives in git log).
      const byFile = new Map<string, Task[]>();
      for (const task of matches) {
        const list = byFile.get(task.file) ?? [];
        list.push(task);
        byFile.set(task.file, list);
      }
      for (const [file, tasks] of byFile) {
        const lines = readFileSync(file, "utf-8").split("\n");
        // remove from the bottom up so indices stay valid
        const ordered = [...tasks].sort((a, b) => b.startLine - a.startLine);
        for (const task of ordered) {
          lines.splice(task.startLine, task.endLine - task.startLine + 1);
        }
        writeFileSync(file, lines.join("\n"));
      }
    },
  };
}
