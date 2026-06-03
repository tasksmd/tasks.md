// Fleet-safe workspace claiming semantics (fleet-claim-workspace-semantics):
// the picker ranks across repos but claims land in the SELECTED repo's backend.
// These prove (a) claim-loss re-rank — a claimed task drops out of the next
// pick; (b) cross-repo blocker resolution; (c) two picks into the same
// git-native target repo cannot both win.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitNativeBackend } from "../backend/git-native.js";
import { pickAcrossWorkspaces } from "./workspaces.js";

let ws: string;

function repo(name: string, tasksMd: string): string {
  const dir = join(ws, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TASKS.md"), tasksMd);
  return dir;
}

function selection() {
  return { roots: [ws], names: ["ws"] };
}

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "ws-claim-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe("workspace claim semantics", () => {
  it("re-ranks on claim loss — a claimed task drops out of the next pick", async () => {
    const repoA = repo("alpha", "# Tasks\n\n## P0\n\n- [ ] Top\n  - **ID**: top\n\n## P1\n\n- [ ] Next\n  - **ID**: next\n");

    const first = await pickAcrossWorkspaces(selection());
    expect(first.pick?.entry.id).toBe("top");

    // Another agent claimed `top` (best-effort file claim). Re-pick must skip it.
    const file = join(repoA, "TASKS.md");
    writeFileSync(file, readFileSync(file, "utf-8").replace("- [ ] Top", "- [ ] Top (@other)"));

    const second = await pickAcrossWorkspaces(selection());
    expect(second.pick?.entry.id).toBe("next");
  });

  it("skips a task whose cross-repo blocker is still open", async () => {
    repo("web", "# Tasks\n\n## P0\n\n- [ ] Dependent\n  - **ID**: dep\n  - **Blocked by**: api#blocker\n");
    repo("api", "# Tasks\n\n## P1\n\n- [ ] Blocker\n  - **ID**: blocker\n");

    // `dep` (P0) is blocked by api#blocker which is still open → picker must
    // pick the lower-priority but unblocked `blocker` instead.
    const result = await pickAcrossWorkspaces(selection());
    expect(result.pick?.entry.id).toBe("blocker");
  });

  it("two picks into the same git-native target repo cannot both win", async () => {
    const gn = join(ws, "gn");
    mkdirSync(gn, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: gn });
    writeFileSync(join(gn, ".tasksmd.json"), JSON.stringify({ backend: "git-native" }));
    const backend = createGitNativeBackend(gn);
    await backend.create({ title: "Shared", priority: "P0" });

    // Both agents pick the same top task across the workspace…
    const a = await pickAcrossWorkspaces(selection());
    const b = await pickAcrossWorkspaces(selection());
    expect(a.pick?.entry.id).toBe("shared");
    expect(b.pick?.entry.id).toBe("shared");

    // …but claiming it in the target repo's git-native backend is collision-free.
    const claimA = await backend.claim("shared", { actorId: "@alice" });
    const claimB = await backend.claim("shared", { actorId: "@bob" });
    const winners = [claimA, claimB].filter((c) => c.status === "claimed");
    expect(winners).toHaveLength(1);
    expect([claimA, claimB].find((c) => c.status !== "claimed")?.status).toBe("already_claimed");
  });
});
