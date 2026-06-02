import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ActorOptions,
  BackendCapabilities,
  BackendTask,
  ClaimTaskOptions,
  ClaimTaskResult,
  CreateTaskInput,
  OperationResult,
  RenderResult,
  TaskBackend,
  UpdateTaskInput,
} from "./types.js";

type GitNativeEventType =
  | "created"
  | "updated"
  | "claimed"
  | "completed"
  | "released"
  | "cancelled";

interface GitNativeEvent {
  schema_version: number;
  event_id: string;
  task_id: string;
  event_type: GitNativeEventType;
  actor_id: string;
  instance_id: string;
  created_at: string;
  parent_event_ids: string[];
  payload: Record<string, unknown>;
}

interface FoldedTask {
  task: BackendTask;
  claimId?: string;
  completed: boolean;
}

const CLAIMS_REF = "refs/heads/tasks-claims";
const DEFAULT_ACTOR = "tasks-md";
const DEFAULT_INSTANCE = "tasks-md-cli";

const capabilities: BackendCapabilities = {
  claims: "collision-free",
  sourceOfTruth: "log",
  generatedSnapshot: true,
  supportsLeases: true,
  // The log is a local git ref that works offline; collision-freedom ACROSS
  // machines additionally needs an origin, but the backend itself does not
  // require one to operate.
  requiresRemote: false,
  humanEditableSnapshot: false,
  operations: {
    create: true,
    update: true,
    claim: true,
    release: true,
    complete: true,
    cancel: true,
    render: true,
    list: true,
  },
};

function git(
  directory: string,
  args: string[],
  input?: string,
  extraEnv: NodeJS.ProcessEnv = {},
): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv },
    input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function tryGit(directory: string, args: string[]): string | undefined {
  try {
    return git(directory, args);
  } catch {
    return undefined;
  }
}

function hasOrigin(directory: string): boolean {
  return Boolean(tryGit(directory, ["remote", "get-url", "origin"]));
}

function fetchClaimsRef(directory: string): void {
  if (!hasOrigin(directory)) {
    return;
  }
  tryGit(directory, [
    "fetch",
    "origin",
    `+${CLAIMS_REF}:${CLAIMS_REF}`,
  ]);
}

function pushClaimsRef(directory: string): boolean {
  if (!hasOrigin(directory)) {
    return true;
  }
  try {
    git(directory, ["push", "origin", `${CLAIMS_REF}:${CLAIMS_REF}`]);
    return true;
  } catch {
    return false;
  }
}

function currentClaimsCommit(directory: string): string | undefined {
  return tryGit(directory, ["rev-parse", "--verify", `${CLAIMS_REF}^{commit}`]);
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `task-${randomUUID().slice(0, 8)}`;
}

function uniqueTaskId(title: string, tasks: Map<string, FoldedTask>): string {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  while (tasks.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function actor(options?: ClaimTaskOptions): string {
  return options?.actorId?.replace(/^@/, "") ?? DEFAULT_ACTOR;
}

function instance(options?: ClaimTaskOptions): string {
  return options?.instanceId ?? DEFAULT_INSTANCE;
}

function makeEvent(
  taskId: string,
  eventType: GitNativeEventType,
  options: ClaimTaskOptions | undefined,
  payload: Record<string, unknown>,
): GitNativeEvent {
  return {
    schema_version: 1,
    event_id: `evt-${randomUUID()}`,
    task_id: taskId,
    event_type: eventType,
    actor_id: actor(options),
    instance_id: instance(options),
    created_at: new Date().toISOString(),
    parent_event_ids: [],
    payload,
  };
}

function eventPath(event: GitNativeEvent): string {
  return `events/${event.event_id}.json`;
}

function serializeEvent(event: GitNativeEvent): string {
  return `${JSON.stringify(event, null, 2)}\n`;
}

function appendEvent(directory: string, event: GitNativeEvent): void {
  const parent = currentClaimsCommit(directory);
  const indexPath = join(tmpdir(), `tasksmd-index-${randomUUID()}`);
  const env: NodeJS.ProcessEnv = {
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: "tasks-md",
    GIT_AUTHOR_EMAIL: "tasks-md@example.invalid",
    GIT_COMMITTER_NAME: "tasks-md",
    GIT_COMMITTER_EMAIL: "tasks-md@example.invalid",
  };
  try {
    if (parent) {
      git(directory, ["read-tree", parent], undefined, env);
    }
    const blob = git(
      directory,
      ["hash-object", "-w", "--stdin"],
      serializeEvent(event),
    );
    git(
      directory,
      ["update-index", "--add", "--cacheinfo", "100644", blob, eventPath(event)],
      undefined,
      env,
    );
    const tree = git(directory, ["write-tree"], undefined, env);
    const commitArgs = parent
      ? ["commit-tree", tree, "-p", parent, "-m", `tasks: ${event.event_type} ${event.task_id}`]
      : ["commit-tree", tree, "-m", `tasks: ${event.event_type} ${event.task_id}`];
    const commit = git(directory, commitArgs, undefined, env);
    const updateArgs = parent
      ? ["update-ref", CLAIMS_REF, commit, parent]
      : ["update-ref", CLAIMS_REF, commit, ""];
    git(directory, updateArgs);
  } finally {
    rmSync(indexPath, { force: true });
  }
}

function readEvent(directory: string, commit: string, path: string): GitNativeEvent | undefined {
  const text = tryGit(directory, ["show", `${commit}:${path}`]);
  return text ? parseEvent(text) : undefined;
}

function eventPathsForCommit(directory: string, commit: string): string[] {
  const output = tryGit(directory, [
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--name-only",
    "-r",
    commit,
  ]);
  return output ? output.split("\n").filter((path) => path.startsWith("events/")) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return undefined;
    }
    strings.push(item);
  }
  return strings;
}

function eventTypeValue(value: unknown): GitNativeEventType | undefined {
  if (
    value === "created" ||
    value === "updated" ||
    value === "claimed" ||
    value === "completed" ||
    value === "released" ||
    value === "cancelled"
  ) {
    return value;
  }
  return undefined;
}

function parseEvent(text: string): GitNativeEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) {
    return undefined;
  }
  const eventType = eventTypeValue(raw.event_type);
  const eventId = stringValue(raw.event_id);
  const taskId = stringValue(raw.task_id);
  const actorId = stringValue(raw.actor_id);
  const instanceId = stringValue(raw.instance_id);
  const createdAt = stringValue(raw.created_at);
  const parentEventIds = stringArrayValue(raw.parent_event_ids);
  const payload = isRecord(raw.payload) ? raw.payload : undefined;
  if (
    raw.schema_version !== 1 ||
    !eventType ||
    !eventId ||
    !taskId ||
    !actorId ||
    !instanceId ||
    !createdAt ||
    !parentEventIds ||
    !payload
  ) {
    return undefined;
  }
  return {
    schema_version: 1,
    event_id: eventId,
    task_id: taskId,
    event_type: eventType,
    actor_id: actorId,
    instance_id: instanceId,
    created_at: createdAt,
    parent_event_ids: parentEventIds,
    payload,
  };
}

function readEvents(directory: string): GitNativeEvent[] {
  const output = tryGit(directory, ["rev-list", "--reverse", CLAIMS_REF]);
  if (!output) {
    return [];
  }
  const events: GitNativeEvent[] = [];
  for (const commit of output.split("\n").filter(Boolean)) {
    for (const path of eventPathsForCommit(directory, commit)) {
      const event = readEvent(directory, commit, path);
      if (event) {
        events.push(event);
      }
    }
  }
  return events;
}

function priorityValue(value: unknown): string {
  const priority = stringValue(value)?.toUpperCase();
  return priority === "P0" || priority === "P1" || priority === "P2" || priority === "P3"
    ? priority
    : "P2";
}

function foldEvents(events: GitNativeEvent[]): Map<string, FoldedTask> {
  const tasks = new Map<string, FoldedTask>();
  for (const event of events) {
    if (event.event_type === "created") {
      const title = stringValue(event.payload.title);
      if (!title) {
        continue;
      }
      tasks.set(event.task_id, {
        task: {
          id: event.task_id,
          title,
          priority: priorityValue(event.payload.priority),
          tags: stringArrayValue(event.payload.tags) ?? [],
          body: stringValue(event.payload.body),
        },
        completed: false,
      });
    }
    if (event.event_type === "updated") {
      const folded = tasks.get(event.task_id);
      if (folded && !folded.completed) {
        const title = stringValue(event.payload.title);
        const body = stringValue(event.payload.body);
        const tags = stringArrayValue(event.payload.tags);
        if (title) folded.task.title = title;
        if (event.payload.priority !== undefined) {
          folded.task.priority = priorityValue(event.payload.priority);
        }
        if (body !== undefined) folded.task.body = body;
        if (tags) folded.task.tags = tags;
      }
    }
    if (event.event_type === "claimed") {
      const folded = tasks.get(event.task_id);
      if (folded && !folded.completed && !folded.task.assignee) {
        folded.task.assignee = event.actor_id;
        folded.claimId = stringValue(event.payload.claim_id);
      }
    }
    if (event.event_type === "released") {
      const folded = tasks.get(event.task_id);
      if (folded && folded.task.assignee === event.actor_id) {
        folded.task.assignee = undefined;
        folded.claimId = undefined;
      }
    }
    if (event.event_type === "completed" || event.event_type === "cancelled") {
      const folded = tasks.get(event.task_id);
      if (folded) {
        folded.completed = true;
      }
    }
  }
  return tasks;
}

function foldLog(directory: string): Map<string, FoldedTask> {
  return foldEvents(readEvents(directory));
}

function sortedTasks(tasks: Map<string, FoldedTask>): BackendTask[] {
  return [...tasks.values()]
    .filter((entry) => !entry.completed)
    .map((entry) => entry.task)
    .sort((first, second) => first.priority.localeCompare(second.priority));
}

function renderTask(task: BackendTask): string[] {
  const claim = task.assignee ? ` (@${task.assignee})` : "";
  const lines = [`- [ ] ${task.title}${claim}`, `  - **ID**: ${task.id}`];
  if (task.tags.length > 0) {
    lines.push(`  - **Tags**: ${task.tags.join(", ")}`);
  }
  if (task.body) {
    lines.push(`  - **Details**: ${task.body}`);
  }
  return lines;
}

export async function renderGitNativeSnapshot(directory: string): Promise<string> {
  fetchClaimsRef(directory);
  const tasks = sortedTasks(foldLog(directory));
  const lines = ["# Tasks", ""];
  for (const priority of ["P0", "P1", "P2", "P3"]) {
    lines.push(`## ${priority}`, "");
    for (const task of tasks.filter((candidate) => candidate.priority === priority)) {
      lines.push(...renderTask(task), "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function createGitNativeBackend(directory: string): TaskBackend {
  return {
    name: "git-native",
    capabilities,

    async listOpen(): Promise<BackendTask[]> {
      fetchClaimsRef(directory);
      return sortedTasks(foldLog(directory));
    },

    async next(): Promise<BackendTask | null> {
      const open = await this.listOpen();
      return open.find((task) => !task.assignee) ?? null;
    },

    async create(input: CreateTaskInput): Promise<BackendTask> {
      fetchClaimsRef(directory);
      const tasks = foldLog(directory);
      const id = uniqueTaskId(input.title, tasks);
      const priority = priorityValue(input.priority);
      const task = {
        id,
        title: input.title,
        priority,
        tags: input.tags ?? [],
        body: input.body,
      };
      appendEvent(
        directory,
        makeEvent(id, "created", undefined, {
          title: task.title,
          priority: task.priority,
          tags: task.tags,
          body: task.body,
        }),
      );
      if (!pushClaimsRef(directory)) {
        fetchClaimsRef(directory);
        throw new Error("Could not push created task to tasks-claims.");
      }
      return task;
    },

    async claim(
      id: string,
      options?: ClaimTaskOptions,
    ): Promise<ClaimTaskResult> {
      let current = foldLog(directory).get(id);
      if (!current) {
        fetchClaimsRef(directory);
        current = foldLog(directory).get(id);
      }
      if (!current || current.completed) {
        return {
          status: "missing",
          backend: "git-native",
          taskId: id,
          owner: actor(options),
          capabilities,
        };
      }
      if (current.task.assignee) {
        return {
          status: "already_claimed",
          backend: "git-native",
          taskId: id,
          owner: actor(options),
          currentOwner: current.task.assignee,
          capabilities,
        };
      }
      const claimId = `claim-${randomUUID()}`;
      appendEvent(
        directory,
        makeEvent(id, "claimed", options, {
          claim_id: claimId,
        }),
      );
      if (!pushClaimsRef(directory)) {
        fetchClaimsRef(directory);
        const winner = foldLog(directory).get(id);
        return {
          status: "lost",
          backend: "git-native",
          taskId: id,
          owner: actor(options),
          currentOwner: winner?.task.assignee,
          capabilities,
          reason: "tasks-claims rejected a non-fast-forward claim push",
        };
      }
      return {
        status: "claimed",
        backend: "git-native",
        taskId: id,
        owner: actor(options),
        claimId,
        capabilities,
      };
    },

    async update(
      id: string,
      patch: UpdateTaskInput,
      options?: ActorOptions,
    ): Promise<OperationResult> {
      if (!foldLog(directory).get(id)) {
        fetchClaimsRef(directory);
        if (!foldLog(directory).get(id)) {
          return { status: "missing", backend: "git-native", operation: "update", taskId: id };
        }
      }
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.priority !== undefined) payload.priority = priorityValue(patch.priority);
      if (patch.body !== undefined) payload.body = patch.body;
      if (patch.tags !== undefined) payload.tags = patch.tags;
      appendEvent(directory, makeEvent(id, "updated", options, payload));
      pushOrThrow(directory, "updated");
      return { status: "ok", backend: "git-native", operation: "update", taskId: id };
    },

    async release(id: string, options?: ActorOptions): Promise<OperationResult> {
      appendEvent(directory, makeEvent(id, "released", options, {}));
      pushOrThrow(directory, "released");
      return { status: "ok", backend: "git-native", operation: "release", taskId: id };
    },

    async complete(id: string, options?: ActorOptions): Promise<OperationResult> {
      appendEvent(directory, makeEvent(id, "completed", options, {}));
      pushOrThrow(directory, "completed");
      return { status: "ok", backend: "git-native", operation: "complete", taskId: id };
    },

    async cancel(id: string, options?: ActorOptions): Promise<OperationResult> {
      appendEvent(directory, makeEvent(id, "cancelled", options, {}));
      pushOrThrow(directory, "cancelled");
      return { status: "ok", backend: "git-native", operation: "cancel", taskId: id };
    },

    async render(): Promise<RenderResult> {
      return {
        status: "ok",
        backend: "git-native",
        content: await renderGitNativeSnapshot(directory),
      };
    },
  };
}

function pushOrThrow(directory: string, eventType: GitNativeEventType): void {
  if (!pushClaimsRef(directory)) {
    fetchClaimsRef(directory);
    throw new Error(`Could not push ${eventType} event to tasks-claims.`);
  }
}
