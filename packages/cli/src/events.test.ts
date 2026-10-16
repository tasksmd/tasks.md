import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eventLine, eventsFile, MAX_BYTES, recordEvent } from "./events.js";

describe("events", () => {
  it("is off in tests, so spawned CLIs never write the user's log", () => {
    expect(process.env.TASKS_EVENTS).toBe("0");
  });

  it("writes one content-free JSON line per event", () => {
    const line = eventLine(
      { component: "claims", event: "claim", ok: false, story: "US03", ms: 12.6, code: "conflict" },
      new Date("2026-10-16T00:00:00Z"),
    );
    expect(JSON.parse(line ?? "")).toEqual({
      ts: "2026-10-16T00:00:00.000Z",
      v: 1,
      component: "claims",
      event: "claim",
      ok: false,
      story: "US03",
      ms: 13,
      code: "conflict",
    });
  });

  it("drops an event whose code could carry free text", () => {
    expect(eventLine({ component: "watch", event: "lint", ok: false, story: "US01", code: "Fix the login bug" })).toBeUndefined();
  });

  it("honors TASKS_EVENTS=0 and TASKS_EVENTS_FILE", () => {
    expect(eventsFile({ TASKS_EVENTS: "0" })).toBeUndefined();
    expect(eventsFile({ TASKS_EVENTS_FILE: "/x/e.jsonl" })).toBe("/x/e.jsonl");
    expect(eventsFile({ XDG_STATE_HOME: "/s" })).toBe(join("/s", "tasks-md", "events.jsonl"));
  });

  it("appends, and rotates the file past the size cap", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasksmd-events-"));
    const file = join(dir, "events.jsonl");
    try {
      writeFileSync(file, "x".repeat(MAX_BYTES + 1));
      recordEvent({ component: "watch", event: "lint", ok: true, story: "US01", count: 0 }, { TASKS_EVENTS_FILE: file });
      expect(statSync(`${file}.1`).size).toBe(MAX_BYTES + 1);
      const lines = readFileSync(file, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? "").event).toBe("lint");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never throws when the log cannot be written", () => {
    expect(() =>
      recordEvent({ component: "watch", event: "lint", ok: true, story: "US01" }, { TASKS_EVENTS_FILE: "/dev/null/no/such" }),
    ).not.toThrow();
  });

  it("stays identical to its tasks-mcp twin below the header comment", () => {
    const body = (path: string) => {
      const text = readFileSync(path, "utf-8");
      const start = text.indexOf("import ");
      const end = text.indexOf("/** The user story each MCP tool serves");
      return text.slice(start, end === -1 ? undefined : end).trimEnd();
    };
    const cli = body(join(import.meta.dirname, "events.ts"));
    const mcp = body(join(import.meta.dirname, "..", "..", "mcp", "src", "events.ts"));
    expect(mcp).toBe(cli);
  });
});
