// Proves the conformance harness runs against the FILE backend too — with
// honest capability skips. The file backend is format/operation-compatible but
// best-effort (not collision-free) and human-editable (no programmatic update),
// so the collision-free / snapshot / lease / enforcement / update checks SKIP
// and only the lifecycle property it genuinely supports (release-and-reclaim)
// runs. This is the "explicit skips for unsupported capability classes" the
// backend-conformance-self-certification task requires.

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
import { createTasksMdBackend } from "./tasks-md.js";
import type { TaskBackend } from "./types.js";

class FileWorld implements ConformanceWorld {
  private readonly backend: TaskBackend;
  constructor(private readonly dir: string) {
    this.backend = createTasksMdBackend(dir);
  }

  async createTask(_actor: string, input: CreateInput): Promise<ConformanceTask> {
    const task = await this.backend.create({
      title: input.title,
      priority: input.priority,
      tags: input.tags,
      body: input.body,
    });
    return { id: task.id, title: task.title, priority: task.priority, tags: task.tags, body: task.body };
  }

  async claim(actor: string, taskId: string): Promise<ClaimOutcome> {
    const r = await this.backend.claim(taskId, { actorId: actor });
    return { status: r.status, claimId: r.claimId, owner: r.owner };
  }

  async release(actor: string, taskId: string): Promise<void> {
    await this.backend.release(taskId, { actorId: actor });
  }
  async complete(_actor: string, taskId: string): Promise<void> {
    await this.backend.complete(taskId);
  }
  async cancel(_actor: string, taskId: string): Promise<void> {
    await this.backend.cancel(taskId);
  }
  async update(actor: string, taskId: string, patch: UpdateInput): Promise<void> {
    await this.backend.update(taskId, patch, { actorId: actor });
  }
  async listOpen(): Promise<ConformanceTask[]> {
    return (await this.backend.listOpen()).map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      tags: task.tags,
      body: task.body,
      assignee: task.assignee,
    }));
  }
  async render(): Promise<string> {
    return (await this.backend.render()).content ?? "";
  }
  async sync(): Promise<void> {}
}

describe("file backend conformance (honest capability skips)", () => {
  it("runs the suite: lifecycle passes, collision-free checks skip", async () => {
    const roots: string[] = [];
    const target: ConformanceTarget = {
      name: "tasks-md (file backend)",
      capabilities: {
        collisionFree: false, // best-effort `(@agent)` claim, not CAS
        leases: false,
        generatedSnapshot: false, // the file IS the surface
        pathScopedEnforcement: false,
        rawEventAppend: false,
        blockedBy: false,
        mutableUpdate: false, // human-editable — `update` returns unsupported
      },
      createWorld: () => {
        const dir = mkdtempSync(join(tmpdir(), "fb-conf-"));
        roots.push(dir);
        execFileSync("git", ["init", "-q"], { cwd: dir });
        return new FileWorld(dir);
      },
    };
    try {
      const report = await runConformance(target);
      expect(failed(report), JSON.stringify(failed(report), null, 2)).toEqual([]);

      const byName = Object.fromEntries(report.results.map((r) => [r.name, r.status]));
      // The lifecycle property the file backend genuinely supports runs + passes.
      expect(byName["release-and-reclaim"]).toBe("pass");
      // Everything that needs a capability the file backend lacks is SKIPPED.
      for (const skipped of [
        "same-task-race",
        "different-task-race",
        "stale-snapshot",
        "human-command-path",
        "lease-expiry-and-steal",
        "claim-fencing",
        "path-scoped-enforcement",
      ]) {
        expect(byName[skipped], `${skipped} should skip on the file backend`).toBe("skip");
      }
    } finally {
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
  });
});
