import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { eventsFile } from "./events.js";

/**
 * Opt-in field telemetry: sends the content-free event log (events.ts) to
 * PostHog EU as anonymous usage counts, so the README Proof section can show
 * real use. Same contract as careerbrew's and agentbrew's adapters. This is
 * the only module that talks to PostHog; a move to self-hosting changes only
 * this file.
 *
 * Sends nothing unless a project key is set (TASKS_POSTHOG_KEY, or the macOS
 * Keychain item service "tasks-md", account "posthog_key"), telemetry is on,
 * and DO_NOT_TRACK is unset. Only fields events.ts already allow-lists leave
 * the machine, under a random install id; person profiles and GeoIP are off.
 * At most one send a day, batched.
 *
 * Lifecycle: per-user file scope. The install id, the cursor (event lines
 * already sent), the on/off flag, and the last send time live in one file,
 * telemetry.json, beside the event log. Delete it to reset.
 */

export const DEFAULT_URL = "https://eu.i.posthog.com/batch/";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Event fields that may leave the machine. Anything else is dropped. */
const ALLOWED = ["v", "component", "ok", "story", "ms", "count", "code"] as const;

export interface TelemetryState {
  installId: string;
  sent: number;
  enabled: boolean;
  lastSend?: string;
}

function stateDir(env: NodeJS.ProcessEnv): string {
  const file = eventsFile({ ...env, TASKS_EVENTS: "1" });
  return file ? dirname(file) : join(homedir(), ".local", "state", "tasks-md");
}

export function statePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.TASKS_TELEMETRY_STATE || join(stateDir(env), "telemetry.json");
}

export function hasState(env: NodeJS.ProcessEnv = process.env): boolean {
  return existsSync(statePath(env));
}

export function loadState(env: NodeJS.ProcessEnv = process.env): TelemetryState {
  try {
    return { enabled: true, sent: 0, ...JSON.parse(readFileSync(statePath(env), "utf-8")) } as TelemetryState;
  } catch {
    return { installId: randomUUID().replace(/-/g, ""), sent: 0, enabled: true };
  }
}

export function saveState(state: TelemetryState, env: NodeJS.ProcessEnv = process.env): void {
  mkdirSync(dirname(statePath(env)), { recursive: true });
  writeFileSync(statePath(env), `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

/** The project key; "" when none is set. Tests set TASKS_POSTHOG_KEY="" to skip the Keychain. */
export function projectKey(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TASKS_POSTHOG_KEY !== undefined) return env.TASKS_POSTHOG_KEY;
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync("security", ["find-generic-password", "-s", "tasks-md", "-a", "posthog_key", "-w"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function doNotTrack(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.DO_NOT_TRACK) && env.DO_NOT_TRACK !== "0";
}

function readLines(env: NodeJS.ProcessEnv): string[] {
  const file = eventsFile({ ...env, TASKS_EVENTS: "1" });
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean);
}

export interface TelemetryStatus {
  on: boolean;
  reason: "on" | "DO_NOT_TRACK" | "turned off" | "no key";
  pending: number;
  lastSend?: string;
}

export function status(env: NodeJS.ProcessEnv = process.env): TelemetryStatus {
  const state = loadState(env);
  const pending = Math.max(0, readLines(env).length - state.sent);
  const base = { pending, lastSend: state.lastSend };
  if (doNotTrack(env)) return { on: false, reason: "DO_NOT_TRACK", ...base };
  if (!state.enabled) return { on: false, reason: "turned off", ...base };
  if (!projectKey(env)) return { on: false, reason: "no key", ...base };
  return { on: true, reason: "on", ...base };
}

export function setEnabled(enabled: boolean, env: NodeJS.ProcessEnv = process.env): void {
  saveState({ ...loadState(env), enabled }, env);
}

/** Event lines as a PostHog batch body. Only ALLOWED fields pass; unparseable lines are skipped. */
export function buildBatch(lines: string[], key: string, installId: string, version: string): Record<string, unknown> {
  const batch = [];
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof e.event !== "string" || typeof e.ts !== "string") continue;
    const properties: Record<string, unknown> = {};
    for (const field of ALLOWED) if (e[field] !== undefined) properties[field] = e[field];
    batch.push({
      event: `tasks.${e.event}`,
      distinct_id: installId,
      timestamp: e.ts,
      properties: { ...properties, app_version: version, $geoip_disable: true, $process_person_profile: false },
    });
  }
  return { api_key: key, batch };
}

export interface SendResult {
  sent: number;
  skipped?: string;
  body?: Record<string, unknown>;
}

/** Send what is pending. With dryRun, return the body (key hidden) and send nothing. Never throws. */
export async function send(
  version: string,
  options: { dryRun?: boolean; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<SendResult> {
  const env = options.env ?? process.env;
  const state = loadState(env);
  const lines = readLines(env).slice(state.sent);
  if (options.dryRun) return { sent: 0, body: buildBatch(lines, "<posthog_key>", state.installId, version) };
  const st = status(env);
  if (!st.on) return { sent: 0, skipped: st.reason };
  if (lines.length === 0) return { sent: 0, skipped: "nothing new" };
  const body = buildBatch(lines, projectKey(env), state.installId, version);
  try {
    const res = await (options.fetchImpl ?? fetch)(env.TASKS_TELEMETRY_URL || DEFAULT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: 0, skipped: `http ${res.status}` };
  } catch {
    return { sent: 0, skipped: "network" };
  }
  saveState({ ...state, sent: state.sent + lines.length, lastSend: new Date().toISOString() }, env);
  return { sent: lines.length };
}

/**
 * Send at most once a day; called after each CLI command. Cheap checks run
 * first, so the Keychain is read at most once a day. Never throws.
 */
export async function sendDaily(
  version: string,
  options: { now?: number; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<SendResult | undefined> {
  const env = options.env ?? process.env;
  try {
    if (doNotTrack(env) || !hasState(env)) return undefined;
    const state = loadState(env);
    if (!state.enabled) return undefined;
    const last = Date.parse(state.lastSend ?? "");
    if (Number.isFinite(last) && (options.now ?? Date.now()) - last < DAY_MS) return undefined;
    return await send(version, { fetchImpl: options.fetchImpl, env });
  } catch {
    return undefined;
  }
}

export const FIRST_RUN_NOTICE =
  "tasks: anonymous usage counts (command, ok, time; never task text) go to PostHog EU once a project key is set. Turn off: tasks telemetry off, or DO_NOT_TRACK=1.";

/** On the first run, create the state file and return the one-line notice; afterwards undefined. */
export function firstRunNotice(env: NodeJS.ProcessEnv = process.env): string | undefined {
  try {
    if (hasState(env)) return undefined;
    saveState(loadState(env), env);
    return doNotTrack(env) ? undefined : FIRST_RUN_NOTICE;
  } catch {
    return undefined;
  }
}
