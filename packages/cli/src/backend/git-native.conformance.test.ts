// Engine bake-off (`git-native-engine-bakeoff`): the git-native backend IS the
// linear-CAS implementation (git's atomic ref non-fast-forward rejection is the
// only "engine"). This runs the shared `@tasks-md/conformance` suite against it
// to prove linear-CAS passes the collision-free + lifecycle + projection
// properties — so v1 ships with NO CRDT engine. See
// docs/research/gitbug-reuse-spike.md for the recorded decision.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ClaimOutcome,
  type ConformanceTarget,
  type ConformanceTask,
  type ConformanceWorld,
  type CreateInput,
  type UpdateInput,
  failed,
  runConformance,
} from "@tasks-md/conformance";
import { describe, expect, it } from "vitest";
import { checkWorkPush, createGitNativeBackend } from "./git-native.js";
import type { TaskBackend } from "./types.js";

function run(args: string[], cwd?: string): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

const LEASE_MS = 1000;

class GitNativeWorld implements ConformanceWorld {
  private readonly clones = new Map<string, { dir: string; backend: TaskBackend }>();
  // Shared, controllable clock so lease expiry is deterministic across clones.
  private clock = 1_000_000;

  constructor(
    private readonly bare: string,
    private readonly root: string,
  ) {}

  private clone(actor: string): { dir: string; backend: TaskBackend } {
    const key = actor.replace(/^@/, "");
    const existing = this.clones.get(key);
    if (existing) {
      return existing;
    }
    const dir = join(this.root, key);
    run(["clone", "--quiet", this.bare, dir]);
    run(["-C", dir, "config", "user.email", `${key}@test.invalid`]);
    run(["-C", dir, "config", "user.name", key]);
    const entry = {
      dir,
      backend: createGitNativeBackend(dir, { now: () => this.clock, leaseMs: LEASE_MS }),
    };
    this.clones.set(key, entry);
    return entry;
  }

  async expireLease(): Promise<void> {
    // Advance the shared clock past any live lease so the next claim can steal.
    this.clock += LEASE_MS + 1;
  }

  async checkWorkPush(input: {
    paths: string[];
    taskId?: string;
    claimId?: string;
  }): Promise<"allowed" | "rejected"> {
    return checkWorkPush(this.clone("__render__").dir, input);
  }

  async createTask(actor: string, input: CreateInput): Promise<ConformanceTask> {
    const task = await this.clone(actor).backend.create(
      {
        title: input.title,
        priority: input.priority,
        tags: input.tags,
        body: input.body,
        blockedBy: input.blockedBy,
      },
      { actorId: actor },
    );
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      tags: task.tags,
      body: task.body,
      blockedBy: task.blockedBy,
    };
  }

  async claim(actor: string, taskId: string): Promise<ClaimOutcome> {
    const result = await this.clone(actor).backend.claim(taskId, {
      actorId: actor,
      instanceId: `${actor.replace(/^@/, "")}/i1`,
    });
    return { status: result.status, claimId: result.claimId, owner: result.owner };
  }

  async release(actor: string, taskId: string): Promise<void> {
    await this.clone(actor).backend.release(taskId, { actorId: actor });
  }

  async complete(actor: string, taskId: string): Promise<void> {
    await this.clone(actor).backend.complete(taskId, { actorId: actor });
  }

  async cancel(actor: string, taskId: string): Promise<void> {
    await this.clone(actor).backend.cancel(taskId, { actorId: actor });
  }

  async update(actor: string, taskId: string, patch: UpdateInput): Promise<void> {
    await this.clone(actor).backend.update(taskId, patch, { actorId: actor });
  }

  async listOpen(actor: string): Promise<ConformanceTask[]> {
    const tasks = await this.clone(actor).backend.listOpen();
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      tags: task.tags,
      body: task.body,
      assignee: task.assignee,
    }));
  }

  async render(): Promise<string> {
    return (await this.clone("__render__").backend.render()).content ?? "";
  }

  async sync(): Promise<void> {
    // Each read fetches the claims ref internally; nothing extra to do.
  }
}

function makeTarget(roots: string[]): ConformanceTarget {
  return {
    name: "git-native (linear-CAS)",
    capabilities: {
      collisionFree: true,
      generatedSnapshot: true,
      leases: true, // Phase 2: lease expiry + steal + fresh fencing token
      mutableUpdate: true, // `update` patches a task in the log
      pathScopedEnforcement: true, // Phase 3: doc-only vs claim-fenced code pushes
      blockedBy: true, // blocked + blocked-by modeled in the fold; claim returns "blocked"
      // The following are honest gaps for v1 (later phases):
      rawEventAppend: false, // raw-event injection not exposed by the backend
    },
    createWorld: () => {
      const root = mkdtempSync(join(tmpdir(), "gn-conf-"));
      roots.push(root);
      const bare = join(root, "remote.git");
      run(["init", "--quiet", "--bare", bare]);
      return new GitNativeWorld(bare, join(root, "clones"));
    },
  };
}

describe("git-native backend conformance (linear-CAS bake-off)", () => {
  it("passes every applicable conformance check; none of the run checks fail", async () => {
    const roots: string[] = [];
    try {
      const report = await runConformance(makeTarget(roots));
      const failures = failed(report);
      expect(
        failures,
        `git-native conformance failures: ${JSON.stringify(failures, null, 2)}`,
      ).toEqual([]);

      // The collision-free + lifecycle + projection properties must actually
      // RUN (not all skip), proving linear-CAS is exercised.
      const ran = report.results.filter((r) => r.status === "pass").map((r) => r.name);
      expect(ran).toEqual(
        expect.arrayContaining([
          "same-task-race",
          "different-task-race",
          "stale-snapshot",
          "human-command-path",
          "release-and-reclaim",
          "idempotent-projection",
          "lease-expiry-and-steal",
          "claim-fencing",
          "path-scoped-enforcement",
          "blocked-by-unclaimable",
        ]),
      );
    } finally {
      for (const root of roots) {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
