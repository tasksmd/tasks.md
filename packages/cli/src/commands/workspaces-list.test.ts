// `tasks workspaces list --json` gives scripts a stable shape, so they stop
// reading ~/.config/tasks-md/workspaces.json directly.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWorkspaces } from "./workspaces.js";

let home: string;
const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };

function workspace(path: string, repos: string[]): string {
  for (const repo of repos) {
    mkdirSync(join(path, repo), { recursive: true });
    writeFileSync(join(path, repo, "TASKS.md"), "# Tasks\n");
  }
  return path;
}

function writeConfig(config: unknown): void {
  mkdirSync(join(home, ".config", "tasks-md"), { recursive: true });
  writeFileSync(join(home, ".config", "tasks-md", "workspaces.json"), JSON.stringify(config));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ws-list-"));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.XDG_CONFIG_HOME = saved.XDG_CONFIG_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("listWorkspaces", () => {
  it("returns empty arrays with no config and nothing to detect", () => {
    expect(listWorkspaces()).toEqual({ configured: [], detected: [] });
  });

  it("returns configured workspaces with their repo counts", () => {
    const root = workspace(join(home, "apps", "tooling"), ["a", "b"]);
    writeConfig({ workspaces: [{ name: "tooling", root }] });
    expect(listWorkspaces()).toEqual({
      configured: [{ name: "tooling", root, repos: 2 }],
      detected: [],
    });
  });

  it("returns auto-detected roots that are not configured yet", () => {
    const configuredRoot = workspace(join(home, "apps", "tooling"), ["a", "b"]);
    const detectedRoot = workspace(join(home, "apps", "work"), ["x", "y"]);
    writeConfig({ workspaces: [{ name: "tooling", root: configuredRoot }] });
    const result = listWorkspaces();
    expect(result.configured.map((w) => w.root)).toEqual([configuredRoot]);
    expect(result.detected).toEqual([detectedRoot]);
  });
});
