import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBackendConfig } from "./config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-cfg-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(obj: unknown) {
  writeFileSync(join(dir, ".tasksmd.json"), JSON.stringify(obj));
}

describe("resolveBackendConfig", () => {
  it("defaults to tasks-md with label 'tasks.md' when no config exists", () => {
    expect(resolveBackendConfig(dir)).toEqual({ backend: "tasks-md", repo: undefined, label: "tasks.md" });
  });

  it("reads github-issues + repo + label from .tasksmd.json", () => {
    writeConfig({ backend: "github-issues", repo: "o/r", label: "queue" });
    expect(resolveBackendConfig(dir)).toEqual({ backend: "github-issues", repo: "o/r", label: "queue" });
  });

  it("reads git-native backend config from .tasksmd.json", () => {
    writeConfig({ backend: "git-native" });
    expect(resolveBackendConfig(dir)).toEqual({ backend: "git-native", repo: undefined, label: "tasks.md" });
  });

  it("an explicit override beats the config file", () => {
    writeConfig({ backend: "github-issues" });
    expect(resolveBackendConfig(dir, "tasks-md").backend).toBe("tasks-md");
  });

  it("rejects an unknown backend value", () => {
    writeConfig({ backend: "jira-direct" });
    expect(() => resolveBackendConfig(dir)).toThrow(/Unknown task backend/);
  });

  it("rejects an unknown override value", () => {
    expect(() => resolveBackendConfig(dir, "nonsense")).toThrow(/Unknown task backend/);
  });

  it("throws on malformed JSON", () => {
    writeFileSync(join(dir, ".tasksmd.json"), "{ not json");
    expect(() => resolveBackendConfig(dir)).toThrow(/not valid JSON/);
  });

  it("defaults the label when config omits it", () => {
    writeConfig({ backend: "github-issues" });
    expect(resolveBackendConfig(dir).label).toBe("tasks.md");
  });
});
