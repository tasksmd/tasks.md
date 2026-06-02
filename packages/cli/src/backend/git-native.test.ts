import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createGitNativeBackend,
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
});
