import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkWorkPush, createGitNativeBackend } from "../backend/git-native.js";
import { runMigrate } from "./migrate.js";

let dir: string;

const SAMPLE = `# Tasks

## P0

- [ ] Urgent fix (@alice)
  - **ID**: urgent-fix
  - **Tags**: bug

## P1

- [ ] Build feature
  - **ID**: build-feature
  - **Tags**: feature
  - **Details**: the details
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-migrate-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, "TASKS.md"), SAMPLE);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runMigrate", () => {
  it("dry-run previews deterministic events and writes nothing", () => {
    const result = runMigrate(dir, {});
    expect(result.applied).toBe(false);
    expect(existsSync(join(dir, ".tasksmd.json"))).toBe(false);
    // urgent-fix: created + claimed; build-feature: created → 3 events.
    expect(result.events).toEqual([
      { task_id: "urgent-fix", event_type: "created", payload: { title: "Urgent fix", priority: "P0", tags: ["bug"], body: undefined } },
      { task_id: "urgent-fix", event_type: "claimed", payload: { migrated_owner: "alice" } },
      { task_id: "build-feature", event_type: "created", payload: { title: "Build feature", priority: "P1", tags: ["feature"], body: "the details" } },
    ]);
    // The dry-run is deterministic — same input, same events.
    expect(runMigrate(dir, {}).events).toEqual(result.events);
  });

  it("apply writes git-native config and the log renders the same open queue", async () => {
    const result = runMigrate(dir, { apply: true });
    expect(result.applied).toBe(true);
    const config = JSON.parse(readFileSync(join(dir, ".tasksmd.json"), "utf-8"));
    expect(config.backend).toBe("git-native");
    expect(config.migratedFrom).toBe("tasks-md");

    const open = await createGitNativeBackend(dir).listOpen();
    expect(open.map((t) => t.id).sort()).toEqual(["build-feature", "urgent-fix"]);
    expect(open.find((t) => t.id === "urgent-fix")?.assignee).toBe("alice");
  });

  it("gives migrated claims a lease so a crashed owner is reclaimable", async () => {
    runMigrate(dir, { apply: true });
    // While the migrated lease is live, the claim still blocks a new claimer.
    const live = await createGitNativeBackend(dir).claim("urgent-fix", { actorId: "@bob" });
    expect(live.status).toBe("already_claimed");
    // After the lease expires (owner crashed, never heartbeat), it is reclaimable —
    // before this fix the lease-less migrated claim was treated as permanently live.
    const past = Date.now() + 25 * 60 * 60 * 1000; // > the 24h DEFAULT_LEASE_MS
    const reclaimed = await createGitNativeBackend(dir, { now: () => past }).claim(
      "urgent-fix",
      { actorId: "@bob" },
    );
    expect(reclaimed.status).toBe("claimed");
  });

  it("uses an unguessable fencing token for migrated claims", () => {
    runMigrate(dir, { apply: true });
    // The old predictable token `claim-migrated-<id>` must NOT validate — an
    // attacker who knows only the public task id cannot forge ownership and
    // push code past the claim gate.
    const forged = checkWorkPush(dir, {
      paths: ["src/code.ts"],
      taskId: "urgent-fix",
      claimId: "claim-migrated-urgent-fix",
    });
    expect(forged).toBe("rejected");
  });

  it("fails safely on duplicate ids", () => {
    writeFileSync(
      join(dir, "TASKS.md"),
      "# Tasks\n\n## P1\n\n- [ ] A\n  - **ID**: dup\n\n- [ ] B\n  - **ID**: dup\n",
    );
    expect(() => runMigrate(dir, {})).toThrow(/Duplicate task id "dup"/);
  });
});
