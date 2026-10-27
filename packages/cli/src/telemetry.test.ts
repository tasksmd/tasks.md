import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBatch, firstRunNotice, loadState, send, sendDaily, setEnabled, status } from "./telemetry.js";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");
const LINE = JSON.stringify({ ts: "2026-10-26T00:00:00.000Z", v: 1, component: "cli", event: "run", ok: true, story: "US04", ms: 12, code: "pick" });

function scratch(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), "tasks-telemetry-"));
  const env: NodeJS.ProcessEnv = { TASKS_EVENTS_FILE: join(dir, "events.jsonl"), TASKS_POSTHOG_KEY: "phc_test_fake" };
  return { dir, env };
}

function fakeFetch(calls: { url: string; body: string }[], ok = true): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: String(init.body) });
    return { ok, status: ok ? 200 : 500 } as Response;
  }) as unknown as typeof fetch;
}

describe("telemetry", () => {
  it("sends only allow-listed fields, with person profiles and GeoIP off", () => {
    const leak = JSON.stringify({ ts: "2026-10-26T00:00:00.000Z", event: "run", ok: true, title: "Secret task", path: "/Users/alice" });
    const body = buildBatch([LINE, leak, "not json"], "k", "id1", "0.0.0") as { batch: { properties: Record<string, unknown> }[] };
    expect(body.batch).toHaveLength(2);
    expect(body.batch[0].properties).toMatchObject({ component: "cli", code: "pick", $process_person_profile: false, $geoip_disable: true });
    expect(JSON.stringify(body)).not.toMatch(/Secret|alice/);
  });

  it("sends nothing without a key, with DO_NOT_TRACK, or when turned off", async () => {
    const { dir, env } = scratch();
    try {
      writeFileSync(env.TASKS_EVENTS_FILE as string, `${LINE}\n`);
      const calls: { url: string; body: string }[] = [];
      expect(await send("0", { env: { ...env, TASKS_POSTHOG_KEY: "" }, fetchImpl: fakeFetch(calls) })).toMatchObject({ skipped: "no key" });
      expect(await send("0", { env: { ...env, DO_NOT_TRACK: "1" }, fetchImpl: fakeFetch(calls) })).toMatchObject({ skipped: "DO_NOT_TRACK" });
      setEnabled(false, env);
      expect(status(env)).toMatchObject({ on: false, reason: "turned off", pending: 1 });
      expect(await send("0", { env, fetchImpl: fakeFetch(calls) })).toMatchObject({ skipped: "turned off" });
      expect(calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("sends pending events once to the configured endpoint, then moves the cursor", async () => {
    const { dir, env } = scratch();
    try {
      writeFileSync(env.TASKS_EVENTS_FILE as string, `${LINE}\n${LINE}\n`);
      const calls: { url: string; body: string }[] = [];
      const e = { ...env, TASKS_TELEMETRY_URL: "http://fake.invalid/batch/" };
      expect(await send("0", { env: e, fetchImpl: fakeFetch(calls) })).toEqual({ sent: 2 });
      expect(calls[0].url).toBe("http://fake.invalid/batch/");
      expect(await send("0", { env: e, fetchImpl: fakeFetch(calls) })).toMatchObject({ skipped: "nothing new" });
      expect(loadState(e).sent).toBe(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("a failed send keeps the cursor and never throws", async () => {
    const { dir, env } = scratch();
    try {
      writeFileSync(env.TASKS_EVENTS_FILE as string, `${LINE}\n`);
      expect(await send("0", { env, fetchImpl: fakeFetch([], false) })).toMatchObject({ skipped: "http 500" });
      const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
      expect(await send("0", { env, fetchImpl: boom })).toMatchObject({ skipped: "network" });
      expect(loadState(env).sent).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("sends at most once a day", async () => {
    const { dir, env } = scratch();
    try {
      writeFileSync(env.TASKS_EVENTS_FILE as string, `${LINE}\n`);
      firstRunNotice(env);
      const calls: { url: string; body: string }[] = [];
      await sendDaily("0", { env, fetchImpl: fakeFetch(calls) });
      writeFileSync(env.TASKS_EVENTS_FILE as string, `${LINE}\n${LINE}\n`);
      await sendDaily("0", { env, fetchImpl: fakeFetch(calls) });
      expect(calls).toHaveLength(1);
      await sendDaily("0", { env, fetchImpl: fakeFetch(calls), now: Date.now() + 25 * 3600 * 1000 });
      expect(calls).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("shows the first-run notice once", () => {
    const { dir, env } = scratch();
    try {
      expect(firstRunNotice(env)).toMatch(/DO_NOT_TRACK=1/);
      expect(firstRunNotice(env)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("CLI: each command logs one content-free run event, and send --dry-run hides the key", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-telemetry-cli-"));
    writeFileSync(join(dir, "TASKS.md"), "# Tasks\n\n## P1\n\n- [ ] Secret launch plan\n  - **ID**: secret-plan\n");
    const env = { ...process.env, TASKS_EVENTS: "1", TASKS_EVENTS_FILE: join(dir, "events.jsonl"), TASKS_POSTHOG_KEY: "phc_canary_value" };
    try {
      expect(spawnSync("node", [CLI, "pick"], { encoding: "utf-8", cwd: dir, env }).status).toBe(0);
      spawnSync("node", [CLI, "list", "--priority", "P9"], { encoding: "utf-8", cwd: dir, env });
      const text = readFileSync(join(dir, "events.jsonl"), "utf-8");
      const events = text.trim().split("\n").map((l) => JSON.parse(l));
      expect(events.map((e) => [e.component, e.event, e.code])).toEqual([
        ["cli", "run", "pick"],
        ["cli", "run", "list"],
      ]);
      expect(events[0]).toMatchObject({ ok: true, story: "US04" });
      expect(text).not.toMatch(/secret|launch/i);

      const dry = spawnSync("node", [CLI, "telemetry", "send", "--dry-run"], { encoding: "utf-8", cwd: dir, env });
      expect(dry.status).toBe(0);
      expect(dry.stdout).toContain("<posthog_key>");
      expect(dry.stdout).not.toContain("phc_canary_value");
      expect(dry.stdout).not.toMatch(/secret|launch/i);

      const st = spawnSync("node", [CLI, "telemetry", "status"], { encoding: "utf-8", cwd: dir, env: { ...env, DO_NOT_TRACK: "1" } });
      expect(st.stdout).toMatch(/off \(DO_NOT_TRACK\)/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
