import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { METRICS, aggregate, machineLabel, posthogTotals, problems, render } from "./proof.mjs";

const README = join(import.meta.dirname, "..", "README.md");

test("the README proof section matches the generator and every metric names its date, kind, and command", () => {
  const data = JSON.parse(readFileSync(METRICS, "utf-8"));
  assert.deepEqual(problems(data, readFileSync(README, "utf-8")), []);
});

test("a metric without a date, kind, or command is a problem", () => {
  const data = { machines: {}, metrics: [{ id: "x", claim: "c", value: 1, unit: "u", command: "", kind: "real use" }] };
  const readme = render(data);
  assert.deepEqual(problems(data, readme), ["x: missing date", "x: missing command"]);
});

test("a hand-edited README section is a problem", () => {
  const data = JSON.parse(readFileSync(METRICS, "utf-8"));
  const readme = readFileSync(README, "utf-8").replace("| Claim | Theory |", "| Claim | Idea |");
  assert.match(problems(data, readme).join("\n"), /differs/);
});

test("the aggregate holds counts only, and a missing field metric says not measured yet", () => {
  const lines = [
    JSON.stringify({ ts: "2026-10-26T01:00:00Z", component: "claims", event: "claim", ok: true, code: "claimed", ms: 10, title: "Secret" }),
    JSON.stringify({ ts: "2026-10-26T01:00:01Z", component: "claims", event: "claim", ok: false, code: "already_claimed" }),
    JSON.stringify({ ts: "2026-10-26T02:00:00Z", component: "claims", event: "complete", ok: true }),
    "not json",
  ];
  const a = aggregate(lines);
  assert.equal(a.claimed, 1);
  assert.equal(a.refused, 1);
  assert.deepEqual(a.completesByDay, { "2026-10-26": 1 });
  assert.doesNotMatch(JSON.stringify(a), /Secret/);
  const out = render({ machines: {}, metrics: [{ id: "cli-success", claim: "c", value: null, unit: "%", date: "d", kind: "k", command: "x" }] });
  assert.match(out, /not measured yet \(field recording on since/);
});

test("the machine label is a hash of the install id, never a host name", () => {
  const dir = mkdtempSync(join(tmpdir(), "proof-"));
  try {
    const env = { TASKS_EVENTS_FILE: join(dir, "events.jsonl") };
    writeFileSync(join(dir, "telemetry.json"), JSON.stringify({ installId: "abc" }));
    assert.match(machineLabel(env), /^m-[0-9a-f]{8}$/);
    assert.equal(machineLabel(env), machineLabel(env));
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("PostHog totals are read only with a personal key, from the configured host", async () => {
  assert.equal(await posthogTotals({}), undefined);
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    return { ok: true, json: async () => ({ results: [[2, 10, 9, 5, 3, 1, 4]] }) };
  };
  const t = await posthogTotals({ TASKS_POSTHOG_PERSONAL_KEY: "phx_fake", TASKS_POSTHOG_PROJECT_ID: "1", TASKS_POSTHOG_API: "http://fake.invalid" }, fake);
  assert.equal(calls[0].url, "http://fake.invalid/api/projects/1/query/");
  assert.deepEqual(t, { machines: 2, cliRuns: 10, cliOk: 9, claims: 5, claimed: 3, refused: 1, claimErrors: 1, completes: 4 });
});
