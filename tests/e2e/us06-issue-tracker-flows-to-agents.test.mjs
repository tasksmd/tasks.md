// US06 Issue tracker decisions flow to agents: sync GitHub Issues and Jira into TASKS.md.
// Story: docs/user-stories/06-issue-tracker-flows-to-agents.md
// The trackers are faked locally (a `gh` shim on PATH, an HTTP server for Jira),
// so the test needs no network and no credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";

import { cleanup, gitEnv, scratchRepo, tasks, tasksLint } from "./helpers.mjs";

const ISSUES = [
  { number: 12, title: "Fix the login redirect", body: "Users loop on /login.", labels: [{ name: "tasks.md" }, { name: "P1" }, { name: "auth" }] },
];

function fakeGh(dir, { authFails = false, listFails = false } = {}) {
  const bin = join(dir, ".fake-bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "issues.json"), JSON.stringify(ISSUES));
  writeFileSync(
    join(bin, "gh"),
    [
      "#!/bin/sh",
      `if [ "$1 $2" = "auth status" ]; then exit ${authFails ? 1 : 0}; fi`,
      `if [ "$1 $2" = "issue list" ] && [ ${listFails ? 1 : 0} = 1 ]; then echo "HTTP 502: rate limited" >&2; exit 1; fi`,
      `if [ "$1 $2" = "issue list" ]; then cat "${join(bin, "issues.json")}"; exit 0; fi`,
      "exit 2",
    ].join("\n"),
  );
  chmodSync(join(bin, "gh"), 0o755);
  return { PATH: `${bin}:${process.env.PATH}` };
}

test("US06 happy: sync github writes a valid task with the mapped priority and tags", () => {
  const dir = scratchRepo();
  try {
    const result = tasks(["sync", "github", "--output", "TASKS.md"], { cwd: dir, env: fakeGh(dir) });
    assert.equal(result.code, 0, result.stderr);
    const md = readFileSync(join(dir, "TASKS.md"), "utf-8");
    assert.match(md, /## P1\n\n- \[ \] Fix the login redirect\n {2}- \*\*ID\*\*: issue-12/);
    assert.match(md, /\*\*Tags\*\*: auth/);
    assert.equal(tasksLint(["TASKS.md"], { cwd: dir }).code, 0);
  } finally {
    cleanup(dir);
  }
});

test("US06 error: an unauthenticated gh fails the sync with the fix", () => {
  const dir = scratchRepo();
  try {
    const result = tasks(["sync", "github", "--output", "TASKS.md"], { cwd: dir, env: fakeGh(dir, { authFails: true }) });
    assert.notEqual(result.code, 0);
    assert.match(result.stdout + result.stderr, /gh auth login/);
  } finally {
    cleanup(dir);
  }
});

test("US06 error: a failed gh issue list fails the sync and leaves TASKS.md unchanged", () => {
  const dir = scratchRepo();
  try {
    const before = "# Tasks\n\n## P1\n\n- [ ] Keep me\n  - **ID**: issue-1\n";
    writeFileSync(join(dir, "TASKS.md"), before);
    const result = tasks(["sync", "github", "--merge", "--output", "TASKS.md"], { cwd: dir, env: fakeGh(dir, { listFails: true }) });
    assert.notEqual(result.code, 0);
    assert.match(result.stdout + result.stderr, /rate limited/);
    assert.equal(readFileSync(join(dir, "TASKS.md"), "utf-8"), before);
  } finally {
    cleanup(dir);
  }
});

// The Jira sync runs as a child process while this process serves the fake API,
// so it must not block the event loop (no spawnSync).
async function syncJira(dir, status) {
  const server = createServer((req, res) => {
    if (status !== 200) {
      res.writeHead(status).end("unauthorized");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({ issues: [{ key: "OPS-7", fields: { summary: "Rotate the API keys", priority: { name: "High" }, labels: ["Security"] } }] }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const bin = process.env.TASKS_E2E_BIN;
  const [cmd, args] = bin ? [bin, []] : [process.execPath, [join(import.meta.dirname, "..", "..", "packages", "cli", "dist", "cli.js")]];
  try {
    const out = await promisify(execFile)(cmd, [...args, "sync", "jira", "--project", "OPS", "--output", "TASKS.md"], {
      cwd: dir,
      env: { ...gitEnv, JIRA_URL: `http://127.0.0.1:${port}`, JIRA_TOKEN: "e2e-placeholder" },
    });
    return { code: 0, output: out.stdout + out.stderr };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  } finally {
    server.close();
  }
}

test("US06 happy: sync jira maps priority High to P1", async () => {
  const dir = scratchRepo();
  try {
    const result = await syncJira(dir, 200);
    assert.equal(result.code, 0, result.output);
    assert.match(readFileSync(join(dir, "TASKS.md"), "utf-8"), /## P1\n\n- \[ \] Rotate the API keys\n {2}- \*\*ID\*\*: jira-OPS-7/);
  } finally {
    cleanup(dir);
  }
});

test("US06 error: a Jira HTTP error fails the sync and shows the status", async () => {
  const dir = scratchRepo();
  try {
    const result = await syncJira(dir, 401);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /HTTP 401/);
  } finally {
    cleanup(dir);
  }
});
