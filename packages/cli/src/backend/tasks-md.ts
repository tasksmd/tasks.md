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
  type ActorOptions,
  type BackendTask,
  type ClaimTaskOptions,
  type ClaimTaskResult,
  type CreateTaskInput,
  type OperationResult,
  type RenderResult,
  type TaskBackend,
  type UpdateTaskInput,
  sortByPriority,
  unsupportedResult,
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

function normalizeActor(options?: ClaimTaskOptions): string {
  return options?.actorId?.replace(/^@/, "") ?? "agent";
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
    capabilities: {
      claims: "best-effort",
      sourceOfTruth: "tasks-md",
      generatedSnapshot: false,
      supportsLeases: false,
      requiresRemote: false,
      humanEditableSnapshot: true,
      operations: {
        create: true,
        update: false,
        claim: true,
        release: true,
        complete: true,
        cancel: true,
        render: true,
        list: true,
      },
    },

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

    async claim(id: string, options?: ClaimTaskOptions): Promise<ClaimTaskResult> {
      const taskFiles = loadAllTasks(directory);
      const matches = findTasksById(taskFiles, id);
      if (matches.length === 0) {
        throw new Error(`No TASKS.md task with id "${id}".`);
      }
      const task = matches[0];
      if (task.claimed) {
        return {
          status: "already_claimed",
          backend: "TASKS.md",
          taskId: id,
          currentOwner: task.claimed,
          capabilities: this.capabilities,
        };
      }

      const lines = readFileSync(task.file, "utf-8").split("\n");
      const taskLineIndex = task.startLine - 1;
      const owner = normalizeActor(options);
      lines[taskLineIndex] = `${lines[taskLineIndex]} (@${owner})`;
      writeFileSync(task.file, lines.join("\n"));
      return {
        status: "claimed",
        backend: "TASKS.md",
        taskId: id,
        owner,
        capabilities: this.capabilities,
      };
    },

    async update(id: string, _patch: UpdateTaskInput): Promise<OperationResult> {
      return unsupportedResult(
        "TASKS.md",
        "update",
        "the file backend is human-editable — edit the task block in TASKS.md directly",
        id,
      );
    },

    async release(id: string, _options?: ActorOptions): Promise<OperationResult> {
      const matches = findTasksById(loadAllTasks(directory), id);
      if (matches.length === 0) {
        throw new Error(`No TASKS.md task with id "${id}".`);
      }
      const task = matches[0];
      if (!task.claimed) {
        return { status: "noop", backend: "TASKS.md", operation: "release", taskId: id };
      }
      const lines = readFileSync(task.file, "utf-8").split("\n");
      const index = task.startLine - 1;
      lines[index] = lines[index].replace(/\s*\(@[^)]+\)\s*$/, "");
      writeFileSync(task.file, lines.join("\n"));
      return { status: "ok", backend: "TASKS.md", operation: "release", taskId: id };
    },

    async complete(id: string): Promise<OperationResult> {
      removeTaskBlocks(directory, id);
      return { status: "ok", backend: "TASKS.md", operation: "complete", taskId: id };
    },

    async cancel(id: string): Promise<OperationResult> {
      removeTaskBlocks(directory, id);
      return { status: "ok", backend: "TASKS.md", operation: "cancel", taskId: id };
    },

    async render(): Promise<RenderResult> {
      // The file IS the surface: "rendering" is just reading it back.
      const content = existsSync(tasksFile) ? readFileSync(tasksFile, "utf-8") : "";
      return { status: "ok", backend: "TASKS.md", content };
    },
  };
}

/** Remove a task's full block(s) from their file(s). History lives in git log. */
function removeTaskBlocks(directory: string, id: string): void {
  const matches = findTasksById(loadAllTasks(directory), id);
  if (matches.length === 0) {
    throw new Error(`No TASKS.md task with id "${id}".`);
  }
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
}
