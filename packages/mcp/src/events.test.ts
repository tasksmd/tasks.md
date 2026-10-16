import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { timedTool, TOOL_STORY } from "./events.js";

describe("tasks-mcp events", () => {
  it("logs one event per tool call, with the tool's story and no content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tasksmd-mcp-events-"));
    const env = { TASKS_EVENTS_FILE: join(dir, "events.jsonl") };
    try {
      await timedTool("claim_task", async () => ({ content: [{ type: "text", text: "Claimed secret task" }] }), env)();
      await timedTool("list_tasks", async () => ({ content: [], isError: true }), env)();
      await expect(timedTool("pick_task", async () => { throw new Error("secret"); }, env)()).rejects.toThrow("secret");
      const text = readFileSync(env.TASKS_EVENTS_FILE, "utf-8");
      const events = text.trim().split("\n").map((l) => JSON.parse(l));
      expect(events.map((e) => [e.event, e.ok, e.code, e.story])).toEqual([
        ["claim_task", true, "ok", "US03"],
        ["list_tasks", false, "tool_error", "US07"],
        ["pick_task", false, "exception", "US04"],
      ]);
      expect(text).not.toMatch(/secret/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps every registered tool to a story", () => {
    const index = readFileSync(join(import.meta.dirname, "index.ts"), "utf-8");
    const tools = [...index.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(TOOL_STORY, tool).toHaveProperty(tool as string);
  });
});
