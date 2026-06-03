import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isBlockerOpen,
  isWorkspace,
  parseBlockerRef,
  parseWorkspace,
  parseWorkspaces,
  workspaceTasks,
} from "./workspace.js";

let root: string;

function repo(workspace: string, name: string, tasksMd: string): void {
  const dir = join(workspace, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TASKS.md"), tasksMd);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ws-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("parseWorkspace", () => {
  it("discovers immediate child repos and attributes their tasks", () => {
    const ws = join(root, "tooling");
    repo(ws, "alpha", "# Tasks\n\n## P0\n\n- [ ] A0\n  - **ID**: a0\n");
    repo(ws, "beta", "# Tasks\n\n## P1\n\n- [ ] B1\n  - **ID**: b1\n");

    const result = parseWorkspace(ws);
    expect(result.workspaceName).toBe("tooling");
    expect(result.repos.map((r) => r.repoName).sort()).toEqual(["alpha", "beta"]);
    expect(result.repos.find((r) => r.repoName === "alpha")?.tasks[0].metadata.id).toBe("a0");
  });

  it("treats a dir with ≥2 child repos as a workspace", () => {
    repo(root, "alpha", "# Tasks\n\n## P0\n\n- [ ] A\n");
    repo(root, "beta", "# Tasks\n\n## P0\n\n- [ ] B\n");
    expect(isWorkspace(root)).toBe(true);
  });
});

describe("parseWorkspaces", () => {
  it("returns per-workspace results and aggregates with attribution", () => {
    const wsA = join(root, "tooling");
    const wsB = join(root, "oncall-hub");
    repo(wsA, "alpha", "# Tasks\n\n## P0\n\n- [ ] urgent\n  - **ID**: a0\n");
    repo(wsB, "api", "# Tasks\n\n## P1\n\n- [ ] later\n  - **ID**: b1\n");

    const results = parseWorkspaces([wsA, wsB]);
    expect(results).toHaveLength(2);
    const flat = workspaceTasks(results);
    expect(flat).toHaveLength(2);
    const a = flat.find((t) => t.task.metadata.id === "a0");
    expect(a?.workspaceName).toBe("tooling");
    expect(a?.repoName).toBe("alpha");
  });
});

describe("parseBlockerRef", () => {
  it("parses single-repo, cross-repo, and cross-workspace forms", () => {
    expect(parseBlockerRef("my-task")).toEqual({ taskId: "my-task" });
    expect(parseBlockerRef("api#fix")).toEqual({ repo: "api", taskId: "fix" });
    expect(parseBlockerRef("oncall-hub::api#fix")).toEqual({
      workspace: "oncall-hub",
      repo: "api",
      taskId: "fix",
    });
  });
});

describe("isBlockerOpen", () => {
  it("resolves a cross-workspace blocker against the aggregated set", () => {
    const wsA = join(root, "tooling");
    const wsB = join(root, "oncall-hub");
    repo(wsA, "alpha", "# Tasks\n\n## P0\n\n- [ ] dep\n  - **ID**: dep\n  - **Blocked by**: oncall-hub::api#blocker\n");
    repo(wsB, "api", "# Tasks\n\n## P0\n\n- [ ] blocker\n  - **ID**: blocker\n");

    const flat = workspaceTasks(parseWorkspaces([wsA, wsB]));
    expect(isBlockerOpen("oncall-hub::api#blocker", flat)).toBe(true);
    expect(isBlockerOpen("oncall-hub::api#nonexistent", flat)).toBe(false);
    // Wrong workspace qualifier → not found → not open.
    expect(isBlockerOpen("tooling::api#blocker", flat)).toBe(false);
  });
});
