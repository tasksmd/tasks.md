import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
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
  TaskOperation,
  UpdateTaskInput,
} from "./types.js";

type GitNativeEventType =
  | "created"
  | "updated"
  | "claimed"
  | "heartbeat"
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
  /** Epoch ms when the current claim's lease expires (Phase 2 leases). */
  leaseExpiresAt?: number;
  completed: boolean;
}

const CLAIMS_REF = "refs/heads/tasks-claims";
const DEFAULT_ACTOR = "tasks-md";
const DEFAULT_INSTANCE = "tasks-md-cli";
// Long-lease backstop (24h) — a dead owner's claim is reclaimable after this
// even without heartbeats. Heartbeats renew it; `--lease`/options override it.
const DEFAULT_LEASE_MS = 24 * 60 * 60 * 1000;

/** Injectable clock + lease window so leases are deterministically testable. */
export interface GitNativeOptions {
  now?: () => number;
  leaseMs?: number;
}

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

let gitSpawns = 0;

// Count of git child processes spawned this process. Exported so a test can
// prove `readEvents` is O(1) in event count (ESM forbids spying the
// `execFileSync` import directly).
export function gitSpawnCount(): number {
  return gitSpawns;
}

function git(
  directory: string,
  args: string[],
  input?: string,
  extraEnv: NodeJS.ProcessEnv = {},
): string {
  gitSpawns += 1;
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

// Buffer-returning git (no encoding, no trim) for byte-exact framing of
// `cat-file --batch` output, where sizes are bytes and blobs may hold multi-byte
// UTF-8 or embedded newlines.
function gitBuffer(directory: string, args: string[], input?: string): Buffer {
  gitSpawns += 1;
  return execFileSync("git", args, {
    cwd: directory,
    env: { ...process.env },
    input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
    maxBuffer: 256 * 1024 * 1024,
  });
}

// Read many blobs in ONE `git cat-file --batch` process. Each spec is a
// `<commit>:<path>` rev; the output frames each object as `<oid> <type> <size>\n`
// + `<size>` content bytes + `\n`, or `<spec> missing\n` for an absent path.
// Returns content Buffers in the input order (null for missing). Parsing walks a
// byte cursor — never decode-then-slice — so multi-byte content frames correctly.
// Exported for the framing conformance test.
export function catFileBatch(directory: string, specs: string[]): (Buffer | null)[] {
  if (specs.length === 0) {
    return [];
  }
  const buf = gitBuffer(directory, ["cat-file", "--batch"], specs.join("\n") + "\n");
  const out: (Buffer | null)[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const nl = buf.indexOf(0x0a, cursor);
    if (nl === -1) {
      break;
    }
    const header = buf.toString("utf-8", cursor, nl);
    cursor = nl + 1;
    if (header.endsWith(" missing")) {
      out.push(null);
      continue;
    }
    const size = Number(header.slice(header.lastIndexOf(" ") + 1));
    if (!Number.isInteger(size) || size < 0) {
      break;
    }
    out.push(buf.subarray(cursor, cursor + size));
    cursor += size + 1; // skip the content and its trailing newline
  }
  return out;
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

const REFRESH_EVENT_TYPE = "tasks-claims-updated";

// Parse "owner/repo" from a github.com remote URL (ssh or https), else undefined.
export function parseGithubSlug(remoteUrl: string): string | undefined {
  return remoteUrl.match(/github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/i)?.[1];
}

// Near-real-time projection refresh is opt-in via `.tasksmd.json` `{ "autoRefresh": true }`.
export function autoRefreshEnabled(directory: string): boolean {
  try {
    const config = JSON.parse(
      readFileSync(join(directory, ".tasksmd.json"), "utf-8"),
    ) as { autoRefresh?: unknown };
    return config.autoRefresh === true;
  } catch {
    return false;
  }
}

// After a successful claims push, fire a GitHub repository_dispatch so a
// subscribed tasks-snapshot workflow regenerates TASKS.md without waiting for
// the next cron tick. Opt-in, github.com only (other platforms use server-side
// push hooks), reuses gh's auth, best-effort — the scheduled projection is the
// guaranteed fallback, so any failure (no gh, no auth, non-github) is silent.
function fireRefreshDispatch(directory: string): void {
  if (!autoRefreshEnabled(directory)) {
    return;
  }
  const remoteUrl = tryGit(directory, ["remote", "get-url", "origin"]);
  const slug = remoteUrl ? parseGithubSlug(remoteUrl) : undefined;
  if (!slug) {
    return;
  }
  try {
    execFileSync(
      "gh",
      [
        "api",
        "--silent",
        "--method",
        "POST",
        `repos/${slug}/dispatches`,
        "-f",
        `event_type=${REFRESH_EVENT_TYPE}`,
      ],
      { cwd: directory, stdio: "ignore", timeout: 15_000 },
    );
  } catch {
    // best-effort; the scheduled projection is the fallback
  }
}

function pushClaimsRef(directory: string): boolean {
  if (!hasOrigin(directory)) {
    return true;
  }
  try {
    git(directory, ["push", "origin", `${CLAIMS_REF}:${CLAIMS_REF}`]);
    fireRefreshDispatch(directory);
    return true;
  } catch {
    return false;
  }
}

// Force-push a rewritten (compacted) log with a lease against `oldTip` — the
// remote tip we compacted from. The lease is the CAS: the push lands only if the
// remote is still at `oldTip`, so a claim that arrived in the fetch→push window
// (advancing the remote) rejects the push and compaction aborts without
// clobbering it. On conflict/no-remote, resync local to the remote so the
// discarded rewrite doesn't linger; the next cycle retries. Exported for the
// no-clobber conformance test.
export function forcePushCompaction(directory: string, oldTip: string | undefined): boolean {
  if (!hasOrigin(directory) || !oldTip) {
    return false;
  }
  try {
    git(directory, [
      "push",
      `--force-with-lease=${CLAIMS_REF}:${oldTip}`,
      "origin",
      `${CLAIMS_REF}:${CLAIMS_REF}`,
    ]);
    return true;
  } catch {
    fetchClaimsRef(directory);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
    value === "heartbeat" ||
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

// Read the whole event log in TWO git processes regardless of size: one
// `git log --reverse --name-only` for the ordered (commit, eventPaths) listing
// (a 0x1e record-separator delimits commits), then one `cat-file --batch` for
// every blob. This replaces the old ~1+2n per-event spawns; order and parse
// filtering are identical (linear chain ⇒ `git log --reverse` == `rev-list
// --reverse`; bad/missing blobs are skipped). Exported for the O(1) spawn test.
export function readEvents(directory: string): GitNativeEvent[] {
  const output = tryGit(directory, [
    "log",
    "--reverse",
    "--format=%x1e%H",
    "--name-only",
    CLAIMS_REF,
    "--",
    "events/",
  ]);
  if (!output) {
    return [];
  }
  const specs: string[] = [];
  for (const record of output.split("\x1e")) {
    const lines = record.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }
    const commit = lines[0];
    for (const path of lines.slice(1)) {
      if (path.startsWith("events/")) {
        specs.push(`${commit}:${path}`);
      }
    }
  }
  const events: GitNativeEvent[] = [];
  for (const blob of catFileBatch(directory, specs)) {
    const event = blob ? parseEvent(blob.toString("utf-8")) : undefined;
    if (event) {
      events.push(event);
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
          blocked: stringValue(event.payload.blocked),
          blockedBy: stringArrayValue(event.payload.blocked_by),
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
        if (event.payload.blocked !== undefined) {
          folded.task.blocked = stringValue(event.payload.blocked);
        }
        if (event.payload.blocked_by !== undefined) {
          folded.task.blockedBy = stringArrayValue(event.payload.blocked_by);
        }
      }
    }
    if (event.event_type === "claimed") {
      const folded = tasks.get(event.task_id);
      // Latest claimed event wins: the backend only appends one when the task
      // was free OR its lease had expired (a legitimate steal), so trusting the
      // most recent claim is correct. claim_id is the fresh fencing token.
      if (folded && !folded.completed) {
        folded.task.assignee = event.actor_id;
        folded.claimId = stringValue(event.payload.claim_id);
        folded.leaseExpiresAt = numberValue(event.payload.lease_expires_at);
      }
    }
    if (event.event_type === "heartbeat") {
      const folded = tasks.get(event.task_id);
      // Only the live owner can renew its own lease.
      if (folded && !folded.completed && folded.task.assignee === event.actor_id) {
        folded.leaseExpiresAt = numberValue(event.payload.lease_expires_at);
      }
    }
    if (event.event_type === "released") {
      const folded = tasks.get(event.task_id);
      if (folded && folded.task.assignee === event.actor_id) {
        folded.task.assignee = undefined;
        folded.claimId = undefined;
        folded.leaseExpiresAt = undefined;
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

export interface FleetStats {
  events: number;
  eventsByType: Record<GitNativeEventType, number>;
  tasksCreated: number;
  open: number;
  claimed: number;
  done: number;
  actors: number;
  /** Tasks claimed more than once (released-and-reclaimed or lease-stolen). */
  reclaimedTasks: number;
  /** Live claims whose lease has already expired (dead-owner / stale heartbeat). */
  staleClaims: number;
  /**
   * Churn proxy: reclaimed ÷ distinct-tasks-ever-claimed. The git-native CAS
   * rejects lost claims WITHOUT appending an event, so the log cannot count
   * lost races directly — re-claims are the observable contention signal.
   */
  contentionRatio: number;
}

/** Fold the tasks-claims log into contention/observability metrics (Phase 4). */
export function gitNativeFleetStats(directory: string, now: number = Date.now()): FleetStats {
  fetchClaimsRef(directory);
  const events = readEvents(directory);
  const eventsByType: Record<GitNativeEventType, number> = {
    created: 0,
    updated: 0,
    claimed: 0,
    heartbeat: 0,
    released: 0,
    completed: 0,
    cancelled: 0,
  };
  const actors = new Set<string>();
  const claimsPerTask = new Map<string, number>();
  for (const event of events) {
    eventsByType[event.event_type] += 1;
    actors.add(event.actor_id);
    if (event.event_type === "claimed") {
      claimsPerTask.set(event.task_id, (claimsPerTask.get(event.task_id) ?? 0) + 1);
    }
  }
  const folded = foldEvents(events);
  let open = 0;
  let claimed = 0;
  let done = 0;
  let staleClaims = 0;
  for (const entry of folded.values()) {
    if (entry.completed) done += 1;
    else if (entry.task.assignee) {
      claimed += 1;
      if (entry.leaseExpiresAt !== undefined && now >= entry.leaseExpiresAt) {
        staleClaims += 1;
      }
    } else open += 1;
  }
  const reclaimedTasks = [...claimsPerTask.values()].filter((n) => n > 1).length;
  const tasksEverClaimed = claimsPerTask.size;
  return {
    events: events.length,
    eventsByType,
    tasksCreated: eventsByType.created,
    open,
    claimed,
    done,
    actors: actors.size,
    reclaimedTasks,
    staleClaims,
    contentionRatio: tasksEverClaimed === 0 ? 0 : reclaimedTasks / tasksEverClaimed,
  };
}

function sortedTasks(tasks: Map<string, FoldedTask>): BackendTask[] {
  return [...tasks.values()]
    .filter((entry) => !entry.completed)
    .map((entry) => entry.task)
    .sort((first, second) => first.priority.localeCompare(second.priority));
}

// A task is blocked (unpickable) if it carries a free-form `blocked` reason, or
// any `blockedBy` id still refers to an OPEN (non-completed) task in the fold.
// An absent or completed blocker does not block — matching the file backend.
function taskIsBlocked(task: BackendTask, fold: Map<string, FoldedTask>): boolean {
  if (task.blocked && task.blocked.trim()) {
    return true;
  }
  return (task.blockedBy ?? []).some((id) => {
    const blocker = fold.get(id);
    return blocker !== undefined && !blocker.completed;
  });
}

// Indent continuation lines of a multi-line value under the list item (4 spaces)
// so the snapshot reads idiomatically; strip-then-indent keeps render idempotent.
function metadataField(label: string, value: string): string[] {
  const [first, ...rest] = value.split("\n");
  return [
    `  - **${label}**: ${first}`,
    ...rest.map((line) => (line.trim() ? `    ${line.replace(/^\s+/, "")}` : "")),
  ];
}

function renderTask(task: BackendTask): string[] {
  const claim = task.assignee ? ` (@${task.assignee})` : "";
  const lines = [`- [ ] ${task.title}${claim}`, `  - **ID**: ${task.id}`];
  if (task.tags.length > 0) {
    lines.push(`  - **Tags**: ${task.tags.join(", ")}`);
  }
  if (task.body) {
    lines.push(...metadataField("Details", task.body));
  }
  if (task.blockedBy && task.blockedBy.length > 0) {
    lines.push(`  - **Blocked by**: ${task.blockedBy.join(", ")}`);
  }
  if (task.blocked && task.blocked.trim()) {
    lines.push(...metadataField("Blocked", task.blocked));
  }
  return lines;
}

const MAX_PUSH_ATTEMPTS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff (100ms → ~5s) with full jitter, per the plan.
function backoffMs(attempt: number): number {
  const cap = Math.min(5000, 100 * 2 ** attempt);
  return Math.floor(cap / 2 + Math.random() * (cap / 2));
}

// Append an event and push it, silently retrying on a non-fast-forward
// rejection (the remote advanced with an UNRELATED event). A fresh event is
// rebuilt each attempt so it chains onto the latest fetched tip. Used by every
// append op EXCEPT claim — a claim conflict means a competing claim on the
// SAME task, where the loser must yield, not retry (see `claim`).
async function appendWithRetry(
  directory: string,
  build: () => GitNativeEvent,
  opName: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
    fetchClaimsRef(directory);
    appendEvent(directory, build());
    if (pushClaimsRef(directory)) {
      return;
    }
    if (attempt < MAX_PUSH_ATTEMPTS - 1) {
      await sleep(backoffMs(attempt));
    }
  }
  fetchClaimsRef(directory);
  throw new Error(
    `Could not push ${opName} event to tasks-claims after ${MAX_PUSH_ATTEMPTS} attempts (the remote kept advancing).`,
  );
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

// Reject a complete/release whose fencing token no longer matches the live
// claim (the lease was stolen). No token supplied → no fencing (backcompat).
function fenceCheck(
  directory: string,
  id: string,
  options: ActorOptions | undefined,
  operation: TaskOperation,
): OperationResult | undefined {
  if (!options?.claimId) {
    return undefined;
  }
  fetchClaimsRef(directory);
  const current = foldLog(directory).get(id);
  if (current?.claimId && current.claimId !== options.claimId) {
    return {
      status: "conflict",
      backend: "git-native",
      operation,
      taskId: id,
      reason: "stale fencing token — the lease was stolen or the claim changed",
    };
  }
  return undefined;
}

export function createGitNativeBackend(
  directory: string,
  options?: GitNativeOptions,
): TaskBackend {
  const now = options?.now ?? (() => Date.now());
  const leaseMs = options?.leaseMs ?? DEFAULT_LEASE_MS;
  const leaseExpiry = () => now() + leaseMs;
  return {
    name: "git-native",
    capabilities,

    async listOpen(): Promise<BackendTask[]> {
      fetchClaimsRef(directory);
      return sortedTasks(foldLog(directory));
    },

    async next(): Promise<BackendTask | null> {
      fetchClaimsRef(directory);
      const fold = foldLog(directory);
      // Skip claimed tasks AND blocked tasks (a `blocked` reason or an
      // unmet `blockedBy` dependency makes a task unpickable).
      return (
        sortedTasks(fold).find(
          (task) => !task.assignee && !taskIsBlocked(task, fold),
        ) ?? null
      );
    },

    async create(
      input: CreateTaskInput,
      options?: ClaimTaskOptions,
    ): Promise<BackendTask> {
      const priority = priorityValue(input.priority);
      const tags = input.tags ?? [];
      for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
        fetchClaimsRef(directory);
        // Recompute the id against the latest fold so a concurrent create with
        // the same title slug still gets a unique id.
        const id = uniqueTaskId(input.title, foldLog(directory));
        appendEvent(
          directory,
          makeEvent(id, "created", options, {
            title: input.title,
            priority,
            tags,
            body: input.body,
            blocked: input.blocked,
            blocked_by: input.blockedBy,
          }),
        );
        if (pushClaimsRef(directory)) {
          return {
            id,
            title: input.title,
            priority,
            tags,
            body: input.body,
            blocked: input.blocked,
            blockedBy: input.blockedBy,
          };
        }
        if (attempt < MAX_PUSH_ATTEMPTS - 1) {
          await sleep(backoffMs(attempt));
        }
      }
      fetchClaimsRef(directory);
      throw new Error(
        `Could not push created task to tasks-claims after ${MAX_PUSH_ATTEMPTS} attempts.`,
      );
    },

    async claim(
      id: string,
      options?: ClaimTaskOptions,
    ): Promise<ClaimTaskResult> {
      let fold = foldLog(directory);
      let current = fold.get(id);
      if (!current) {
        fetchClaimsRef(directory);
        fold = foldLog(directory);
        current = fold.get(id);
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
      // If the task declares blockers, refresh first so the blocked check reads
      // fresh state (a blocker's completion may have been pushed by another
      // clone). Tasks with no blockers skip the fetch, so the collision-free
      // CAS-reject path still exercises a genuinely stale snapshot.
      if (current.task.blocked || (current.task.blockedBy?.length ?? 0) > 0) {
        fetchClaimsRef(directory);
        fold = foldLog(directory);
        current = fold.get(id);
        if (!current || current.completed) {
          return {
            status: "missing",
            backend: "git-native",
            taskId: id,
            owner: actor(options),
            capabilities,
          };
        }
      }
      // An unmet blocker (a `blocked` reason or an open `blockedBy` dependency)
      // makes a task unclaimable until the blocker closes.
      if (taskIsBlocked(current.task, fold)) {
        return {
          status: "blocked",
          backend: "git-native",
          taskId: id,
          owner: actor(options),
          capabilities,
        };
      }
      // A live (non-expired) lease blocks a new claimer; an expired lease is
      // stealable. A claim with NO lease is treated as live (the long-lease
      // backstop) so pre-lease v1 claims aren't stolen; migrated claims always
      // carry a lease (see applyMigration), so only truly ancient claims hit it.
      const leaseLive =
        current.leaseExpiresAt === undefined || now() < current.leaseExpiresAt;
      if (current.task.assignee && leaseLive) {
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
          lease_expires_at: leaseExpiry(),
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
      // Fetch first so the local claims ref exists (a fresh clone only has
      // refs/remotes/origin/tasks-claims) and the new event fast-forwards.
      fetchClaimsRef(directory);
      if (!foldLog(directory).get(id)) {
        return { status: "missing", backend: "git-native", operation: "update", taskId: id };
      }
      // A supplied fencing token must match the live claim (a stale/foreign token
      // can't mutate the task). No token → unfenced, as before.
      const fence = fenceCheck(directory, id, options, "update");
      if (fence) return fence;
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.priority !== undefined) payload.priority = priorityValue(patch.priority);
      if (patch.body !== undefined) payload.body = patch.body;
      if (patch.tags !== undefined) payload.tags = patch.tags;
      if (patch.blocked !== undefined) payload.blocked = patch.blocked;
      if (patch.blockedBy !== undefined) payload.blocked_by = patch.blockedBy;
      await appendWithRetry(directory, () => makeEvent(id, "updated", options, payload), "updated");
      return { status: "ok", backend: "git-native", operation: "update", taskId: id };
    },

    async heartbeat(id: string, options?: ClaimTaskOptions): Promise<OperationResult> {
      fetchClaimsRef(directory);
      const current = foldLog(directory).get(id);
      if (!current || current.completed) {
        return { status: "missing", backend: "git-native", operation: "claim", taskId: id };
      }
      // Only the live owner may renew. A stale fencing token (lease was stolen)
      // is rejected so a restarted agent can detect it no longer owns the task.
      if (current.task.assignee !== actor(options)) {
        return {
          status: "conflict",
          backend: "git-native",
          operation: "claim",
          taskId: id,
          reason: `not the owner (held by ${current.task.assignee ?? "nobody"})`,
        };
      }
      if (options?.claimId && current.claimId && options.claimId !== current.claimId) {
        return {
          status: "conflict",
          backend: "git-native",
          operation: "claim",
          taskId: id,
          reason: "stale fencing token — lease was stolen",
        };
      }
      await appendWithRetry(
        directory,
        () => makeEvent(id, "heartbeat", options, { lease_expires_at: leaseExpiry() }),
        "heartbeat",
      );
      return { status: "ok", backend: "git-native", operation: "claim", taskId: id };
    },

    async release(id: string, options?: ActorOptions): Promise<OperationResult> {
      const fence = fenceCheck(directory, id, options, "release");
      if (fence) return fence;
      await appendWithRetry(directory, () => makeEvent(id, "released", options, {}), "released");
      return { status: "ok", backend: "git-native", operation: "release", taskId: id };
    },

    async complete(id: string, options?: ActorOptions): Promise<OperationResult> {
      const fence = fenceCheck(directory, id, options, "complete");
      if (fence) return fence;
      await appendWithRetry(directory, () => makeEvent(id, "completed", options, {}), "completed");
      return { status: "ok", backend: "git-native", operation: "complete", taskId: id };
    },

    async cancel(id: string, options?: ActorOptions): Promise<OperationResult> {
      await appendWithRetry(directory, () => makeEvent(id, "cancelled", options, {}), "cancelled");
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

// ── Migration: import an existing file-backend TASKS.md into the log ──

export interface MigrationTask {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  body?: string;
  /** Free-form `**Blocked**` reason, preserved so the task stays unpickable. */
  blocked?: string;
  /** `**Blocked by**` task-id dependencies, preserved across the migration. */
  blockedBy?: string[];
  /** Claiming agent (without the leading `@`), if the task carried a claim. */
  claimedBy?: string;
}

/** A deterministic preview event (no uuid/timestamp — content only). */
export interface MigrationEventPreview {
  task_id: string;
  event_type: "created" | "claimed";
  payload: Record<string, unknown>;
}

/**
 * Build the deterministic event content a migration WOULD append. Pure — no
 * git writes, no event ids or timestamps — so a dry-run is reproducible.
 * Throws on a duplicate task id so migration fails safely before writing.
 */
export function previewMigration(tasks: MigrationTask[]): MigrationEventPreview[] {
  const seen = new Set<string>();
  const events: MigrationEventPreview[] = [];
  for (const task of tasks) {
    if (!task.id) {
      throw new Error(`Cannot migrate a task with no id: "${task.title}".`);
    }
    if (seen.has(task.id)) {
      throw new Error(`Duplicate task id "${task.id}" — migration aborted (ids must be unique).`);
    }
    seen.add(task.id);
    events.push({
      task_id: task.id,
      event_type: "created",
      payload: {
        title: task.title,
        priority: priorityValue(task.priority),
        tags: task.tags,
        body: task.body,
        blocked: task.blocked,
        blocked_by: task.blockedBy,
      },
    });
    if (task.claimedBy) {
      events.push({
        task_id: task.id,
        event_type: "claimed",
        payload: { migrated_owner: task.claimedBy.replace(/^@/, "") },
      });
    }
  }
  return events;
}

/**
 * Apply a migration: append `created` (+ `claimed`) events preserving the
 * original ids, then push once. Validates via {@link previewMigration} first.
 */
export function applyMigration(directory: string, tasks: MigrationTask[]): void {
  previewMigration(tasks); // throws on duplicate/missing ids before any write
  fetchClaimsRef(directory);
  for (const task of tasks) {
    appendEvent(
      directory,
      makeEvent(task.id, "created", undefined, {
        title: task.title,
        priority: priorityValue(task.priority),
        tags: task.tags,
        body: task.body,
        blocked: task.blocked,
        blocked_by: task.blockedBy,
      }),
    );
    if (task.claimedBy) {
      const owner = task.claimedBy.replace(/^@/, "");
      appendEvent(
        directory,
        makeEvent(task.id, "claimed", { actorId: owner }, {
          // Random suffix — NOT the public task id. The claim_id is a fencing
          // capability; a predictable `claim-migrated-<id>` would let anyone who
          // knows the task id forge ownership (pass check-push / complete --claim).
          claim_id: `claim-migrated-${randomUUID()}`,
          // Give the migrated claim a normal lease so a crashed/abandoned owner
          // is reclaimable after it expires (a lease-less claim is treated as
          // permanently live — see the reclaim check — which would pin a
          // migrated task to a dead owner forever).
          lease_expires_at: Date.now() + DEFAULT_LEASE_MS,
        }),
      );
    }
  }
  if (!pushClaimsRef(directory)) {
    fetchClaimsRef(directory);
    throw new Error("Could not push migrated events to tasks-claims.");
  }
}

// ── Compaction (Phase 2): bound fold cost while preserving open-task state ──

export interface CompactionResult {
  before: number;
  after: number;
  /** Whether the rewritten log was pushed to origin (false = no remote, or a
   * lease conflict aborted the push so a concurrent claim is not clobbered). */
  pushed: boolean;
}

/** True when the log is large enough to be worth compacting (event count ≥ threshold).
 * Counts commits (one event per commit) cheaply, without folding. */
export function shouldCompact(directory: string, threshold: number): boolean {
  const count = tryGit(directory, ["rev-list", "--count", CLAIMS_REF]);
  return count !== undefined && Number(count) >= threshold;
}

/**
 * Rewrite the local `tasks-claims` log to the minimal event set that folds to
 * the SAME open-task state: one `created` per open task, plus one `claimed`
 * (carrying its `claim_id` + `lease_expires_at`) per live claim. Terminal
 * (completed/cancelled) tasks are dropped — their history stays in the old
 * ref's git objects until GC. This rewrites history, so it is a single-writer
 * maintenance op (the projection job). The post-compaction fold of open tasks is
 * byte-identical to the pre-compaction one.
 *
 * The rewrite is pushed with `--force-with-lease` against the tip we compacted
 * from: claims arrive from agents at any time, so if one landed in the
 * fetch→push window the remote has advanced past the lease and the push is
 * rejected — compaction aborts without clobbering that claim, and the next
 * cycle retries. `claim_id` + `lease_expires_at` are carried into the minimal
 * `claimed` event, so fencing (which keys on `claim_id`) survives a compaction.
 */
export function compactGitNativeLog(directory: string): CompactionResult {
  fetchClaimsRef(directory);
  const oldTip = currentClaimsCommit(directory);
  const before = readEvents(directory).length;
  const folded = foldLog(directory);

  const minimal: GitNativeEvent[] = [];
  for (const [id, entry] of folded) {
    if (entry.completed) {
      continue;
    }
    minimal.push(
      makeEvent(id, "created", undefined, {
        title: entry.task.title,
        priority: entry.task.priority,
        tags: entry.task.tags,
        body: entry.task.body,
        blocked: entry.task.blocked,
        blocked_by: entry.task.blockedBy,
      }),
    );
    if (entry.task.assignee) {
      minimal.push(
        makeEvent(id, "claimed", { actorId: entry.task.assignee }, {
          claim_id: entry.claimId,
          lease_expires_at: entry.leaseExpiresAt,
        }),
      );
    }
  }

  // Rebuild the ref as a fresh per-event chain (one commit per event) so
  // readEvents — which folds in rev-list/commit order — replays created before
  // claimed deterministically. The ref is force-reset first so the new root
  // chains cleanly even if a prior compaction left a ref behind.
  tryGit(directory, ["update-ref", "-d", CLAIMS_REF]);
  for (const event of minimal) {
    appendEvent(directory, event);
  }
  const pushed = forcePushCompaction(directory, oldTip);
  return { before, after: minimal.length, pushed };
}

// ── Phase 3: path-scoped enforcement (the claim-check primitive) ──

// A path is a "doc" (pushable without a claim) iff it is markdown, plain text,
// or the generated TASKS.md snapshot. Everything else — including executable
// code UNDER docs/ (e.g. docs/migrate.py) — requires a live claim. This is the
// single rule shared by the client hook, the CI required check, and the
// server-side pre-receive recipe, so they cannot drift apart.
export function isDocPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return base === "TASKS.md" || /\.(md|markdown|txt)$/i.test(base);
}

export interface WorkPushInput {
  paths: string[];
  taskId?: string;
  claimId?: string;
}

/**
 * Decide whether a set of changed paths may be pushed. Doc-only pushes are
 * always allowed; a push that touches any non-doc path is allowed only with a
 * live claim whose `claim_id` fencing token matches the supplied one (so a
 * stolen/stale claim is rejected). Pure given the folded log.
 */
export function checkWorkPush(
  directory: string,
  input: WorkPushInput,
): "allowed" | "rejected" {
  if (!input.paths.some((path) => !isDocPath(path))) {
    return "allowed";
  }
  if (!input.taskId || !input.claimId) {
    return "rejected";
  }
  fetchClaimsRef(directory);
  const current = foldLog(directory).get(input.taskId);
  if (!current || current.completed || current.claimId !== input.claimId) {
    return "rejected";
  }
  return "allowed";
}
