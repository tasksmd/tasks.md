import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  autoRefreshEnabled,
  compactGitNativeLog,
  createGitNativeBackend,
  parseGithubSlug,
  renderGitNativeSnapshot,
} from "./git-native.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }
  directories.length = 0;
});

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

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
  }).trim();
}

function makeRepo(prefix: string): string {
  const directory = makeDirectory(prefix);
  git(directory, ["init", "-q"]);
  return directory;
}

describe("git-native backend", () => {
  it("stores created tasks in the claims log and renders an idempotent TASKS.md snapshot", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    const backend = createGitNativeBackend(directory);

    const task = await backend.create({
      title: "Ship fleet claims",
      priority: "P1",
      tags: ["fleet"],
      body: "Use the log-first backend.",
    });

    expect(task).toMatchObject({
      id: "ship-fleet-claims",
      priority: "P1",
      title: "Ship fleet claims",
      tags: ["fleet"],
    });
    expect(await backend.listOpen()).toEqual([task]);
    expect(await backend.next()).toMatchObject({ id: "ship-fleet-claims" });

    const snapshot = await renderGitNativeSnapshot(directory);
    expect(snapshot).toContain("- [ ] Ship fleet claims");
    expect(snapshot).toContain("**ID**: ship-fleet-claims");
    expect(snapshot).toContain("**Tags**: fleet");
    expect(snapshot).toBe(await renderGitNativeSnapshot(directory));
    expect(existsSync(join(directory, "TASKS.md"))).toBe(false);
  });

  it("allows only one stale clone to win a claim for the same task", async () => {
    const origin = makeDirectory("tasksmd-origin-");
    git(origin, ["init", "--bare", "-q"]);
    const firstClone = makeDirectory("tasksmd-clone-a-");
    const secondClone = makeDirectory("tasksmd-clone-b-");
    git(tmpdir(), ["clone", "-q", origin, firstClone]);
    git(tmpdir(), ["clone", "-q", origin, secondClone]);

    const firstBackend = createGitNativeBackend(firstClone);
    await firstBackend.create({ title: "Claim once", priority: "P0" });

    const secondBackend = createGitNativeBackend(secondClone);
    expect(await secondBackend.listOpen()).toHaveLength(1);

    const firstResult = await firstBackend.claim("claim-once", {
      actorId: "agent-a",
      instanceId: "agent-a-1",
    });
    const secondResult = await secondBackend.claim("claim-once", {
      actorId: "agent-b",
      instanceId: "agent-b-1",
    });

    expect(firstResult.status).toBe("claimed");
    expect(firstResult.claimId).toMatch(/^claim-/);
    expect(secondResult.status).toBe("lost");
    expect(secondResult.currentOwner).toBe("agent-a");
    expect(await secondBackend.next()).toBeNull();
  });

  it("ignores malformed events when folding the log", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    const backend = createGitNativeBackend(directory);
    await backend.create({ title: "Keep valid events", priority: "P1" });
    const parent = git(directory, ["rev-parse", "--verify", "tasks-claims"]);
    const indexPath = join(makeDirectory("tasksmd-index-"), "index");
    const indexEnv = { GIT_INDEX_FILE: indexPath };
    const commitEnv = {
      ...indexEnv,
      GIT_AUTHOR_NAME: "tasks-md",
      GIT_AUTHOR_EMAIL: "tasks-md@example.invalid",
      GIT_COMMITTER_NAME: "tasks-md",
      GIT_COMMITTER_EMAIL: "tasks-md@example.invalid",
    };
    git(directory, ["read-tree", parent], undefined, indexEnv);
    const blob = git(directory, ["hash-object", "-w", "--stdin"], "{not json");
    git(
      directory,
      ["update-index", "--add", "--cacheinfo", "100644", blob, "events/bad.json"],
      undefined,
      indexEnv,
    );
    const tree = git(directory, ["write-tree"], undefined, indexEnv);
    const commit = git(
      directory,
      ["commit-tree", tree, "-p", parent, "-m", "test: bad event"],
      undefined,
      commitEnv,
    );
    git(directory, ["update-ref", "refs/heads/tasks-claims", commit, parent]);

    await expect(backend.listOpen()).resolves.toMatchObject([
      { id: "keep-valid-events" },
    ]);
  });

  it("renews a lease with a heartbeat so a live owner is not stolen from", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    let clock = 0;
    const backend = createGitNativeBackend(directory, { now: () => clock, leaseMs: 1000 });
    await backend.create({ title: "Leased", priority: "P1" });

    const claim = await backend.claim("leased", { actorId: "@alice" }); // lease → 1000
    expect(claim.status).toBe("claimed");

    clock = 900; // before expiry; renew → lease → 1900
    expect((await backend.heartbeat?.("leased", { actorId: "@alice" }))?.status).toBe("ok");

    clock = 1500; // past the ORIGINAL lease (1000) but within the renewed one (1900)
    const contested = await backend.claim("leased", { actorId: "@bob" });
    expect(contested.status).toBe("already_claimed");

    clock = 2000; // past the renewed lease → stealable
    expect((await backend.claim("leased", { actorId: "@bob" })).status).toBe("claimed");
  });

  it("rejects a stale fencing token after the lease is stolen (crash recovery)", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    let clock = 0;
    const backend = createGitNativeBackend(directory, { now: () => clock, leaseMs: 1000 });
    await backend.create({ title: "Fenced", priority: "P0" });

    const aliceClaim = await backend.claim("fenced", { actorId: "@alice" });
    expect(aliceClaim.claimId).toBeDefined();

    clock = 2000; // alice's lease expired
    const bobClaim = await backend.claim("fenced", { actorId: "@bob" }); // steal
    expect(bobClaim.status).toBe("claimed");
    expect(bobClaim.claimId).not.toBe(aliceClaim.claimId);

    // Alice restarts and tries to complete with her now-stale token → rejected.
    const stale = await backend.complete("fenced", {
      actorId: "@alice",
      claimId: aliceClaim.claimId,
    });
    expect(stale.status).toBe("conflict");

    // Bob, the live owner, completes with the current token.
    const ok = await backend.complete("fenced", { actorId: "@bob", claimId: bobClaim.claimId });
    expect(ok.status).toBe("ok");
  });

  it("models blocked + blocked-by: unpickable, unclaimable, and rendered", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    const backend = createGitNativeBackend(directory);
    await backend.create({ title: "Blocker", priority: "P0" });
    await backend.create({ title: "Dependent", priority: "P0", blockedBy: ["blocker"] });
    await backend.create({ title: "External", priority: "P0", blocked: "needs-user-approval" });
    await backend.create({ title: "Free work", priority: "P1" });

    // next() skips the blocked-by-dependent and the externally-blocked task,
    // and the P0 blocker outranks the free P1 — so the blocker is picked first.
    expect((await backend.next())?.id).toBe("blocker");
    // The dependent cannot be claimed while its blocker is open.
    expect((await backend.claim("dependent", { actorId: "@a" })).status).toBe("blocked");
    // The externally-blocked task cannot be claimed at all.
    expect((await backend.claim("external", { actorId: "@a" })).status).toBe("blocked");

    // Complete the blocker → the dependent becomes pickable + claimable.
    await backend.complete("blocker", { actorId: "@a" });
    expect((await backend.next())?.id).toBe("dependent");
    expect((await backend.claim("dependent", { actorId: "@b" })).status).toBe("claimed");

    // The snapshot round-trips the blocked metadata so it lints clean.
    const snapshot = await renderGitNativeSnapshot(directory);
    expect(snapshot).toContain("**Blocked**: needs-user-approval");
    expect(snapshot).toContain("**Blocked by**: blocker");
  });

  it("indents continuation lines of multi-line field values under the list item", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    const backend = createGitNativeBackend(directory);
    await backend.create({
      title: "Multi-line details",
      priority: "P2",
      body: "First line of context.\nSecond line that must be indented.",
    });

    const snapshot = await renderGitNativeSnapshot(directory);
    expect(snapshot).toContain(
      "  - **Details**: First line of context.\n    Second line that must be indented.",
    );
    // The continuation line is not left flush-left.
    expect(snapshot).not.toContain("\nSecond line that must be indented.");
    // Render stays idempotent.
    expect(await renderGitNativeSnapshot(directory)).toBe(snapshot);
  });

  it("compacts the log to a fold-equivalent open-task state", async () => {
    const directory = makeRepo("tasksmd-git-native-");
    const backend = createGitNativeBackend(directory);
    await backend.create({ title: "Keep open", priority: "P1", tags: ["a"] });
    await backend.create({ title: "Keep claimed", priority: "P0" });
    await backend.create({ title: "Will finish", priority: "P2" });
    await backend.claim("keep-claimed", { actorId: "@alice" });
    await backend.complete("will-finish", { actorId: "@bob" });

    const before = await backend.listOpen();
    const beforeSnapshot = await renderGitNativeSnapshot(directory);

    const result = compactGitNativeLog(directory);
    expect(result.after).toBeLessThan(result.before); // dropped the completed task's events

    const after = await backend.listOpen();
    expect(after).toEqual(before); // open-task fold is identical
    expect(after.find((t) => t.id === "keep-claimed")?.assignee).toBe("alice");
    expect(await renderGitNativeSnapshot(directory)).toBe(beforeSnapshot);
  });

  it("parses owner/repo from github remote URLs and rejects non-github", () => {
    expect(parseGithubSlug("git@github.com:tasksmd/tasks.md.git")).toBe("tasksmd/tasks.md");
    expect(parseGithubSlug("https://github.com/tasksmd/tasks.md.git")).toBe("tasksmd/tasks.md");
    expect(parseGithubSlug("https://github.com/tasksmd/tasks.md")).toBe("tasksmd/tasks.md");
    expect(parseGithubSlug("ssh://git@github.com/owner/repo.git")).toBe("owner/repo");
    expect(parseGithubSlug("git@gitlab.com:owner/repo.git")).toBeUndefined();
  });

  it("reads the opt-in autoRefresh flag from .tasksmd.json", () => {
    const enabled = makeDirectory("tasksmd-cfg-");
    writeFileSync(
      join(enabled, ".tasksmd.json"),
      JSON.stringify({ backend: "git-native", autoRefresh: true }),
    );
    expect(autoRefreshEnabled(enabled)).toBe(true);

    const disabled = makeDirectory("tasksmd-cfg-");
    writeFileSync(join(disabled, ".tasksmd.json"), JSON.stringify({ backend: "git-native" }));
    expect(autoRefreshEnabled(disabled)).toBe(false);

    // Missing config → disabled.
    expect(autoRefreshEnabled(makeDirectory("tasksmd-cfg-"))).toBe(false);
  });
});
