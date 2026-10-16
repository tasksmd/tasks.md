// Shared helpers for the user-story e2e tests in tests/e2e/.
//
// Each test drives the `tasks` CLI as a user would, in a scratch git repo
// under the OS temp dir, and never touches this checkout. `scripts/e2e.sh`
// packs every workspace package, installs the tarballs into an empty prefix,
// and points TASKS_E2E_BIN / TASKS_E2E_LINT_BIN at the installed binaries.
// Without them, the tests fall back to the local build (`npm run build`).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const localCli = join(repoRoot, "packages", "cli", "dist", "cli.js");
const localLint = join(repoRoot, "packages", "lint", "dist", "cli.js");

/** True when the run uses binaries installed from packed tarballs. */
export const packed = Boolean(process.env.TASKS_E2E_BIN);

// A neutral git identity and no user config, so the owner's global hooks and
// gitignore (which lists TASKS.md) never leak into a test.
export const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@example.com",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@example.com",
};

function runBin(bin, args, { cwd, env = {} }) {
  const [cmd, argv] = bin.endsWith(".js") ? [process.execPath, [bin, ...args]] : [bin, args];
  const result = spawnSync(cmd, argv, {
    cwd,
    env: { ...gitEnv, ...env },
    encoding: "utf-8",
    timeout: 60_000,
  });
  return { code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Run the `tasks` CLI in `cwd`. */
export function tasks(args, opts) {
  return runBin(process.env.TASKS_E2E_BIN || localCli, args, opts);
}

/** Run the `tasks-lint` CLI in `cwd`. */
export function tasksLint(args, opts) {
  return runBin(process.env.TASKS_E2E_LINT_BIN || localLint, args, opts);
}

/** Run git in `cwd` with the neutral identity; throws on failure. */
export function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, env: gitEnv, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Create a scratch git repo with `files` ({ relativePath: content }) committed.
 * Returns its path; call `cleanup(dir)` in a finally block.
 */
export function scratchRepo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tasksmd-e2e-"));
  git(dir, "init", "-q", "-b", "main");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/** Build a TASKS.md from { P0: [blocks], P1: [...] }; each block is an array of lines. */
export function tasksMd(sections) {
  const out = ["# Tasks", ""];
  for (const [priority, blocks] of Object.entries(sections)) {
    out.push(`## ${priority}`, "");
    for (const block of blocks) out.push(...block, "");
  }
  return out.join("\n");
}
