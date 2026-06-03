// Backend-agnostic conformance contract.
//
// A backend proves it implements the tasks.md fleet semantics (spec.md
// § "Fleet coordination" + § "Agent-mediated task operations") by providing a
// `ConformanceTarget`. The suite drives it through a battery of checks; a check
// that needs a capability the target does not declare is skipped, not failed.

export interface ConformanceTask {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  body?: string;
  /** Privacy-safe owner id when the task is live-claimed. */
  assignee?: string;
  /** IDs this task is blocked by; it is unclaimable until they all close. */
  blockedBy?: string[];
}

export interface CreateInput {
  id?: string;
  title: string;
  priority?: string;
  tags?: string[];
  body?: string;
  blockedBy?: string[];
}

export interface UpdateInput {
  title?: string;
  priority?: string;
  tags?: string[];
  body?: string;
}

export type ClaimStatus =
  | "claimed"
  | "lost"
  | "already_claimed"
  | "blocked"
  | "missing";

export interface ClaimOutcome {
  status: ClaimStatus;
  /** Fencing token, present only on a successful `claimed`. */
  claimId?: string;
  owner?: string;
}

/** A prospective work push, used to exercise path-scoped enforcement + fencing. */
export interface WorkChange {
  /** Changed file paths (relative). */
  paths: string[];
  /** The task the change claims to be for (`Task:` trailer). */
  taskId?: string;
  /** The fencing token the change carries (`Task-Claim:` trailer). */
  claimId?: string;
}

export type EnforcementOutcome = "allowed" | "rejected";

export interface ConformanceCapabilities {
  /** Two agents never both hold the same task (the core fleet guarantee). */
  collisionFree: boolean;
  /** Claims carry a lease that can expire so a dead owner is reclaimable. */
  leases: boolean;
  /** `TASKS.md` is a generated, byte-idempotent projection of the log. */
  generatedSnapshot: boolean;
  /** A work push is gated by path (code needs a live claim; docs pass). */
  pathScopedEnforcement: boolean;
  /** Raw events can be injected to exercise canonical-serialization rules. */
  rawEventAppend: boolean;
  /** `blocked-by` tasks are unclaimable until their blockers close. */
  blockedBy: boolean;
  /** `update` programmatically patches a task (false for human-edited file backends). */
  mutableUpdate: boolean;
}

/**
 * One isolated coordination "world" — for a collision-free backend this stands
 * in for a remote shared by several clones. Operations are performed "as" an
 * actor id; `sync()` propagates state between participants.
 */
export interface ConformanceWorld {
  createTask(actor: string, input: CreateInput): Promise<ConformanceTask>;
  claim(actor: string, taskId: string): Promise<ClaimOutcome>;
  release(actor: string, taskId: string): Promise<void>;
  complete(actor: string, taskId: string): Promise<void>;
  cancel(actor: string, taskId: string, reason?: string): Promise<void>;
  update(actor: string, taskId: string, patch: UpdateInput): Promise<void>;
  listOpen(actor: string): Promise<ConformanceTask[]>;
  /** The generated human-readable snapshot (`TASKS.md` bytes). */
  render(): Promise<string>;
  /** Propagate state between participants (a no-op for a single shared log). */
  sync(): Promise<void>;
  /** Inject a raw serialized event (requires `rawEventAppend`). */
  appendRawEvent?(raw: string): Promise<void>;
  /** Force the current claim's lease on `taskId` to be expired (requires `leases`). */
  expireLease?(taskId: string): Promise<void>;
  /** Decide a work push (requires `pathScopedEnforcement`). */
  checkWorkPush?(change: WorkChange): Promise<EnforcementOutcome> | EnforcementOutcome;
  dispose?(): Promise<void> | void;
}

export interface ConformanceTarget {
  name: string;
  capabilities: ConformanceCapabilities;
  createWorld(): Promise<ConformanceWorld> | ConformanceWorld;
}

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  reason?: string;
}

export interface ConformanceReport {
  target: string;
  results: CheckResult[];
}

export function allPassed(report: ConformanceReport): boolean {
  return report.results.every((result) => result.status !== "fail");
}

export function failed(report: ConformanceReport): CheckResult[] {
  return report.results.filter((result) => result.status === "fail");
}

export interface ConformanceSummary {
  target: string;
  certified: boolean;
  passed: number;
  failed: number;
  skipped: number;
  results: CheckResult[];
}

/**
 * A stable, machine-readable summary that backend docs / CI can link or assert
 * against. `certified` is true iff no check failed (skips are allowed — they
 * mean "this backend doesn't claim that capability class").
 */
export function summarizeReport(report: ConformanceReport): ConformanceSummary {
  const count = (status: CheckStatus) =>
    report.results.filter((result) => result.status === status).length;
  return {
    target: report.target,
    certified: allPassed(report),
    passed: count("pass"),
    failed: count("fail"),
    skipped: count("skip"),
    results: report.results,
  };
}
