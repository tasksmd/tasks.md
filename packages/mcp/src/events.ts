// Content-free JSONL events for `tasks-mcp`, the long-running MCP server.
// Twin of packages/cli/src/events.ts (same file, same schema); keep them in
// sync. tasks-mcp does not depend on the CLI, so the writer is copied, not shared.
//
// An event holds codes, counts, and timings only, never task text, IDs,
// titles, paths, or error messages. Every string value must match SAFE, so
// free text cannot leak in by accident. Each event names the user story it
// serves, so an error maps to the story it breaks (docs/observability.md).
//
// File: $TASKS_EVENTS_FILE, else $XDG_STATE_HOME/tasks-md/events.jsonl, else
// ~/.local/state/tasks-md/events.jsonl. Process scope: each process appends;
// the file rotates to events.jsonl.1 past MAX_BYTES. TASKS_EVENTS=0 turns it
// off. Writing never throws: a broken log must not break the command.

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Component = "watch" | "claims" | "mcp" | "cli";

export interface TaskEvent {
  component: Component;
  event: string;
  ok: boolean;
  story: `US${string}`;
  ms?: number;
  count?: number;
  code?: string;
}

const SAFE = /^[a-z0-9_.:-]{1,40}$/i;
export const MAX_BYTES = 1_000_000;

export function eventsFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.TASKS_EVENTS === "0") return undefined;
  if (env.TASKS_EVENTS_FILE) return env.TASKS_EVENTS_FILE;
  const state = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(state, "tasks-md", "events.jsonl");
}

/** The JSON line for an event, or undefined when a field could carry content. */
export function eventLine(event: TaskEvent, now = new Date()): string | undefined {
  for (const value of [event.component, event.event, event.story, event.code]) {
    if (value !== undefined && !SAFE.test(value)) return undefined;
  }
  const record: Record<string, unknown> = {
    ts: now.toISOString(),
    v: 1,
    component: event.component,
    event: event.event,
    ok: event.ok,
    story: event.story,
  };
  if (Number.isFinite(event.ms)) record.ms = Math.round(event.ms as number);
  if (Number.isInteger(event.count)) record.count = event.count;
  if (event.code !== undefined) record.code = event.code;
  return `${JSON.stringify(record)}\n`;
}

export function recordEvent(event: TaskEvent, env: NodeJS.ProcessEnv = process.env): void {
  const file = eventsFile(env);
  const line = eventLine(event);
  if (!file || !line) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
    } catch {
      // no file yet
    }
    appendFileSync(file, line);
  } catch {
    // never let logging break the command
  }
}

/** The user story each MCP tool serves, so a tool error names the story it breaks. */
export const TOOL_STORY: Record<string, `US${string}`> = {
  list_tasks: "US07",
  claim_task: "US03",
  unclaim_task: "US03",
  complete_task: "US03",
  pick_task: "US04",
  add_task: "US02",
  enrich_task: "US08",
  find_next_task_across_workspaces: "US05",
};

/** Wrap an MCP tool handler so each call logs one timed, content-free event. */
export function timedTool<A extends unknown[], R>(
  name: string,
  handler: (...args: A) => Promise<R> | R,
  env: NodeJS.ProcessEnv = process.env,
): (...args: A) => Promise<R> {
  const story = TOOL_STORY[name] ?? "US03";
  return async (...args: A) => {
    const started = performance.now();
    try {
      const result = await handler(...args);
      const isError = Boolean((result as { isError?: boolean } | undefined)?.isError);
      recordEvent(
        { component: "mcp", event: name, ok: !isError, code: isError ? "tool_error" : "ok", ms: performance.now() - started, story },
        env,
      );
      return result;
    } catch (error) {
      recordEvent({ component: "mcp", event: name, ok: false, code: "exception", ms: performance.now() - started, story }, env);
      throw error;
    }
  };
}
