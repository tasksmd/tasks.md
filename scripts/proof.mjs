#!/usr/bin/env node
// The README Proof section: measured numbers for what tasks.md claims.
//
//   node scripts/proof.mjs record   aggregate this machine's field events and
//                                   run the local measurements; writes
//                                   docs/proof/metrics.json
//   node scripts/proof.mjs readme   write the README section from that file
//   node scripts/proof.mjs check    exit 1 when the README section is stale or
//                                   a metric lacks a date, kind, or command
//
// Field data: the content-free event log (docs/observability.md). Only counts
// leave the log: per-machine totals under a label that is a hash of the random
// telemetry install id, never a host or user name. When the owner sets
// TASKS_POSTHOG_PERSONAL_KEY and TASKS_POSTHOG_PROJECT_ID, totals come from
// PostHog's query API instead (all machines). Nothing is uploaded from here.

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const METRICS = join(root, "docs", "proof", "metrics.json");
const README = join(root, "README.md");
const START = "<!-- proof:start -->";
const END = "<!-- proof:end -->";
export const FIELD_SINCE = "2026-10-26";

export function eventsPath(env = process.env) {
  if (env.TASKS_EVENTS_FILE) return env.TASKS_EVENTS_FILE;
  return join(env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "tasks-md", "events.jsonl");
}

/** A stable machine label: a hash of the random install id in telemetry.json. */
export function machineLabel(env = process.env) {
  const state = env.TASKS_TELEMETRY_STATE || join(dirname(eventsPath(env)), "telemetry.json");
  let id;
  try {
    id = JSON.parse(readFileSync(state, "utf-8")).installId;
  } catch {
    // no telemetry state yet
  }
  if (!id) {
    id = randomUUID().replace(/-/g, "");
    mkdirSync(dirname(state), { recursive: true });
    writeFileSync(state, `${JSON.stringify({ installId: id, sent: 0, enabled: true })}\n`, { mode: 0o600 });
  }
  return `m-${createHash("sha256").update(`tasks-md-proof:${id}`).digest("hex").slice(0, 8)}`;
}

/** Per-machine totals from event lines: counts only, no text. */
export function aggregate(lines) {
  const t = { claims: 0, claimed: 0, refused: 0, claimErrors: 0, completes: 0, claimMs: [], cliRuns: 0, cliOk: 0, cliMs: [], completesByDay: {} };
  for (const line of lines) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.component === "claims" && e.event === "claim") {
      t.claims += 1;
      if (e.ok) t.claimed += 1;
      else if (e.code === "already_claimed") t.refused += 1;
      else t.claimErrors += 1;
      if (e.ok && Number.isFinite(e.ms)) t.claimMs.push(e.ms);
    } else if (e.component === "claims" && e.event === "complete" && e.ok) {
      t.completes += 1;
      const day = String(e.ts).slice(0, 10);
      t.completesByDay[day] = (t.completesByDay[day] ?? 0) + 1;
    } else if (e.component === "cli" && e.event === "run") {
      t.cliRuns += 1;
      if (e.ok) t.cliOk += 1;
      if (Number.isFinite(e.ms)) t.cliMs.push(e.ms);
    }
  }
  const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  return {
    claims: t.claims, claimed: t.claimed, refused: t.refused, claimErrors: t.claimErrors, completes: t.completes,
    claimMedianMs: median(t.claimMs), cliRuns: t.cliRuns, cliOk: t.cliOk, cliMedianMs: median(t.cliMs),
    completesByDay: t.completesByDay,
  };
}

/** Totals from PostHog's query API (HogQL). Used only when the owner set a personal key. */
export async function posthogTotals(env = process.env, fetchImpl = fetch) {
  const key = env.TASKS_POSTHOG_PERSONAL_KEY;
  const project = env.TASKS_POSTHOG_PROJECT_ID;
  if (!key || !project) return undefined;
  const host = env.TASKS_POSTHOG_API || "https://eu.posthog.com";
  const query =
    "SELECT count(DISTINCT distinct_id), countIf(event = 'tasks.run'), countIf(event = 'tasks.run' AND properties.ok = true), " +
    "countIf(event = 'tasks.claim'), countIf(event = 'tasks.claim' AND properties.ok = true), " +
    "countIf(event = 'tasks.claim' AND properties.code = 'already_claimed'), countIf(event = 'tasks.complete' AND properties.ok = true) " +
    "FROM events WHERE event LIKE 'tasks.%'";
  const res = await fetchImpl(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) return undefined;
  const [machines, cliRuns, cliOk, claims, claimed, refused, completes] = (await res.json()).results[0];
  return { machines, cliRuns, cliOk, claims, claimed, refused, claimErrors: claims - claimed - refused, completes };
}

function machineName() {
  return `${process.platform}-${process.arch}`;
}

function time(fn, runs = 5) {
  const ms = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    fn();
    ms.push(performance.now() - t);
  }
  return Math.round(ms.sort((a, b) => a - b)[Math.floor(runs / 2)]);
}

/** Local measurements: lint every example queue, and time `tasks pick` on a 1,000-task queue. */
function localRuns() {
  const lint = join(root, "packages", "lint", "dist", "cli.js");
  const cli = join(root, "packages", "cli", "dist", "cli.js");
  const examples = readdirSync(join(root, "examples")).filter((f) => f.endsWith(".md") && f !== "README.md");
  let clean = 0;
  for (const f of examples) {
    try {
      execFileSync("node", [lint, join(root, "examples", f)], { stdio: "ignore" });
      clean += 1;
    } catch {
      // a lint failure counts as not clean
    }
  }
  const dir = mkdtempSync(join(tmpdir(), "tasks-proof-"));
  const lines = ["# Tasks", ""];
  for (const p of ["P0", "P1", "P2", "P3"]) {
    lines.push(`## ${p}`, "");
    for (let i = 0; i < 250; i += 1) {
      lines.push(`- [ ] Task ${p}-${i}`, `  - **ID**: t-${p.toLowerCase()}-${i}`);
      if (i > 0) lines.push(`  - **Blocked by**: t-${p.toLowerCase()}-${i - 1}`);
      lines.push("");
    }
  }
  writeFileSync(join(dir, "TASKS.md"), lines.join("\n"));
  const env = { ...process.env, TASKS_EVENTS: "0", DO_NOT_TRACK: "1" };
  const pickMs = time(() => execFileSync("node", [cli, "pick"], { cwd: dir, env, stdio: "ignore" }));
  rmSync(dir, { recursive: true });
  return { examples: examples.length, clean, pickMs };
}

function upsert(metrics, id, fields) {
  const old = metrics.find((m) => m.id === id);
  const history = [...(old?.history ?? [])];
  if (fields.value !== null && fields.value !== undefined) {
    const last = history[history.length - 1];
    if (last && last.date === fields.date) history.pop();
    history.push({ date: fields.date, value: fields.value });
  }
  const next = { id, ...fields, history: history.slice(-30) };
  if (old) metrics[metrics.indexOf(old)] = next;
  else metrics.push(next);
}

export async function record(env = process.env, today = new Date().toISOString().slice(0, 10)) {
  const data = existsSync(METRICS) ? JSON.parse(readFileSync(METRICS, "utf-8")) : { machines: {}, metrics: [] };
  const file = eventsPath(env);
  if (existsSync(file)) {
    data.machines[machineLabel(env)] = { date: today, ...aggregate(readFileSync(file, "utf-8").split("\n").filter(Boolean)) };
  }
  const remote = await posthogTotals(env).catch(() => undefined);
  const local = Object.values(data.machines);
  const sum = (k) => local.reduce((s, m) => s + (m[k] ?? 0), 0);
  const t = remote ?? { machines: local.length, cliRuns: sum("cliRuns"), cliOk: sum("cliOk"), claims: sum("claims"), claimed: sum("claimed"), refused: sum("refused"), claimErrors: sum("claimErrors"), completes: sum("completes") };
  const kind = remote ? "real use (PostHog)" : "real use (local aggregate)";
  const field = "node scripts/proof.mjs record";
  upsert(data.metrics, "tasks-completed", { claim: "Agents finish work from the queue", value: t.completes, unit: "tasks", n: t.machines, date: today, kind, command: field });
  upsert(data.metrics, "double-claims-refused", { claim: "No two agents take one task", value: t.refused, unit: "second claims refused (an accepted double claim cannot be logged; the conformance suite tests it)", n: t.machines, date: today, kind, command: field });
  upsert(data.metrics, "claim-errors", { claim: "Claiming works on real runs", value: t.claims ? Math.round((100 * t.claimErrors) / t.claims) : null, unit: "% of claims", of: t.claims, n: t.machines, date: today, kind, command: field });
  upsert(data.metrics, "cli-success", { claim: "The CLI works on real runs", value: t.cliRuns ? Math.round((100 * t.cliOk) / t.cliRuns) : null, unit: "% of runs", of: t.cliRuns, n: t.machines, date: today, kind, command: field });
  const run = localRuns();
  const lkind = `local run, ${today}, ${machineName()}`;
  upsert(data.metrics, "examples-lint-clean", { claim: "One plain Markdown format any tool can check", value: run.clean, unit: `of ${run.examples} example queues lint clean`, date: today, kind: lkind, command: field });
  upsert(data.metrics, "pick-1000", { claim: "Pick the next task fast", value: run.pickMs, unit: "ms for `tasks pick` on 1,000 tasks (median of 5)", date: today, kind: lkind, command: field });
  mkdirSync(dirname(METRICS), { recursive: true });
  writeFileSync(METRICS, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

const THEORY = {
  "tasks-completed": "The queue lives in the repo, so an agent picks the next task in any session without a person in the loop",
  "double-claims-refused": "A claim is a compare-and-swap on a git ref (Herlihy 1991); the loser sees `already_claimed`",
  "claim-errors": "Errors are counted per story in the content-free log (docs/observability.md)",
  "cli-success": "Each command logs ok or error once, so the rate is per real run",
  "examples-lint-clean": "A format with a linter is checkable by any tool, not only one vendor",
  "pick-1000": "One parse of one file; no server, no network",
};

function result(m) {
  if (m.value === null || m.value === undefined) return `not measured yet (field recording on since ${FIELD_SINCE})`;
  const of = m.of != null ? ` (n = ${m.of})` : "";
  return `${m.value}${String(m.unit).startsWith("%") ? "" : " "}${m.unit}${of}`;
}

export function render(data) {
  const rows = data.metrics.map((m) => {
    const machines = m.n != null ? `, ${m.n} machine${m.n === 1 ? "" : "s"}` : "";
    return `| ${m.claim} | ${THEORY[m.id] ?? ""} | ${m.id} (\`${m.command}\`) | ${result(m)} | \`docs/proof/metrics.json\`, ${m.kind}${machines} |`;
  });
  const machines = Object.values(data.machines);
  const sum = (k) => machines.reduce((s, x) => s + (x[k] ?? 0), 0);
  const days = {};
  for (const x of machines) for (const [d, c] of Object.entries(x.completesByDay ?? {})) days[d] = (days[d] ?? 0) + c;
  const dayKeys = Object.keys(days).sort();
  const out = [
    START,
    "<!-- Generated by `node scripts/proof.mjs readme` from docs/proof/metrics.json. Do not edit by hand. -->",
    "",
    "Each row is one claim and the number that tests it. Field rows count real runs on the owner's machines (content-free events, counts only). Rows marked `local run` are one measurement on one machine.",
    "",
    "| Claim | Theory | Metric | Result | Source |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "Claim outcomes on real runs (git-native backend):",
    "",
    "```mermaid",
    "pie showData",
    `    "claimed" : ${sum("claimed")}`,
    `    "refused: already claimed" : ${sum("refused")}`,
    `    "error" : ${sum("claimErrors")}`,
    "```",
  ];
  if (dayKeys.length) {
    out.push(
      "",
      "Tasks completed per day on real runs:",
      "",
      "```mermaid",
      "xychart-beta",
      '    title "Tasks completed per day (field)"',
      `    x-axis [${dayKeys.map((d) => `"${d.slice(5)}"`).join(", ")}]`,
      '    y-axis "tasks"',
      `    bar [${dayKeys.map((d) => days[d]).join(", ")}]`,
      "```",
    );
  }
  out.push(
    "",
    `**Honest gaps:** the field data comes from ${machines.length} machine${machines.length === 1 ? "" : "s"} so far. CLI run recording began on ` +
      `${FIELD_SINCE}, so older runs are not counted. Usage counts reach PostHog only after the owner sets a project key ([observability](docs/observability.md#field-telemetry)). Refresh: \`node scripts/proof.mjs record && node scripts/proof.mjs readme\`.`,
    END,
  );
  return out.join("\n");
}

/** Problems with the metrics file or the README section; [] when all is well. */
export function problems(data, readme) {
  const out = [];
  for (const m of data.metrics) {
    for (const k of ["date", "kind", "command"]) if (!m[k]) out.push(`${m.id}: missing ${k}`);
  }
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s < 0 || e < 0) out.push("README: no proof markers");
  else if (readme.slice(s, e + END.length) !== render(data)) out.push("README: proof section differs from `node scripts/proof.mjs readme`");
  return out;
}

async function main(cmd) {
  if (cmd === "record") {
    await record();
    console.log(`wrote ${METRICS}`);
  } else if (cmd === "readme") {
    const data = JSON.parse(readFileSync(METRICS, "utf-8"));
    const readme = readFileSync(README, "utf-8");
    const s = readme.indexOf(START);
    const e = readme.indexOf(END);
    if (s < 0 || e < 0) throw new Error("README has no proof markers");
    writeFileSync(README, readme.slice(0, s) + render(data) + readme.slice(e + END.length));
    console.log("README proof section written");
  } else if (cmd === "check") {
    const p = problems(JSON.parse(readFileSync(METRICS, "utf-8")), readFileSync(README, "utf-8"));
    for (const x of p) console.error(x);
    process.exitCode = p.length ? 1 : 0;
    if (!p.length) console.log("proof: README section and metrics are current");
  } else {
    console.error("usage: node scripts/proof.mjs record|readme|check");
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv[2]);
