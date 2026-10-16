import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAIM_CHECK_WORKFLOW } from "./commands/fleet.js";

// The claim-check workflow (this repo's copy and the `fleet init` template)
// must tell a claim violation apart from a tooling failure (the cli did not
// install, it lacks check-push, or it crashed). Both used to print
// "code change without a live task claim".
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "tasks-claim-check.yml"),
  "utf-8",
);
const STEP = "Path-scoped claim check";

// Return the `run: |` block of the named step, de-indented.
function stepRun(yaml: string, name: string): string {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start < 0) throw new Error(`workflow has no step named "${name}"`);
  const run = lines.findIndex((line, index) => index > start && line.trim() === "run: |");
  const indent = (lines[run + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n").replaceAll("${{ github.base_ref }}", "main");
}

// A fake cli whose behavior FAKE_CLI selects: allow | reject | nocmd | crash |
// missing. A fake `npm install` copies it into place; a fake `npx` runs it.
const FAKE_CLI = `const mode = process.env.FAKE_CLI;
const args = process.argv.slice(2);
// Like commander: root --help lists the commands and exits 0.
if (args[0] === "--help") {
  console.log(mode === "nocmd" ? "Commands:\\n  list" : "Commands:\\n  check-push [options] <paths...>");
  process.exit(0);
}
if (mode === "nocmd") { console.error("error: unknown command 'check-push'"); process.exit(1); }
// The paths come from an untrusted diff: they must follow "--" so a file
// named --help is a path, not a flag.
if (!args.includes("--")) throw new Error("paths passed without --");
if (mode === "allow") { console.log("allowed: doc-only change"); process.exit(0); }
if (mode === "reject") { console.error("rejected: this push changes non-markdown files without a live claim"); process.exit(1); }
throw new Error("boom");
`;
const FAKE_NPM = `#!/bin/sh
[ "$1" = "install" ] || exit 0
[ "$FAKE_CLI" = "missing" ] && { echo "npm ERR! 404" >&2; exit 1; }
mkdir -p node_modules/@tasks-md/cli/dist
cp "$FAKE_CLI_JS" node_modules/@tasks-md/cli/dist/cli.js
`;
const FAKE_NPX = `#!/bin/sh
[ "$FAKE_CLI" = "missing" ] && { echo "npm ERR! 404" >&2; exit 1; }
[ "$1" = "-y" ] && shift
shift
exec node "$FAKE_CLI_JS" "$@"
`;

const SLOW_MS = 120_000;
let dir: string;

function git(args: string[], cwd: string): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-claimcheck-"));
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "npm"), FAKE_NPM);
  writeFileSync(join(bin, "npx"), FAKE_NPX);
  chmodSync(join(bin, "npm"), 0o755);
  chmodSync(join(bin, "npx"), 0o755);
  writeFileSync(join(dir, "fakecli.js"), FAKE_CLI);
  mkdirSync(join(dir, "runner"));
  git(["init", "-q", "--bare", "-b", "main", origin], dir);
  git(["clone", "-q", origin, work], dir);
  for (const [k, v] of [
    ["user.name", "t"],
    ["user.email", "t@example.com"],
  ]) {
    git(["config", k, v], work);
  }
  writeFileSync(join(work, "README.md"), "# x\n");
  git(["add", "README.md"], work);
  git(["commit", "-q", "-m", "init"], work);
  git(["push", "-q", "origin", "HEAD:main"], work);
  git(["checkout", "-q", "-b", "pr"], work);
  writeFileSync(join(work, "code.ts"), "export {};\n");
  git(["add", "code.ts"], work);
  git(["commit", "-q", "-m", "feat: code"], work);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runCheck(yaml: string, fake: string, enforce: string): { code: number; output: string } {
  // GitHub's default run shell: bash --noprofile --norc -eo pipefail {0}
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", "-c", stepRun(yaml, STEP)],
    {
      cwd: join(dir, "work"),
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        // A BASH_ENV startup file can reset PATH and hide the fake npm.
        BASH_ENV: "",
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        RUNNER_TEMP: join(dir, "runner"),
        FAKE_CLI: fake,
        FAKE_CLI_JS: join(dir, "fakecli.js"),
        ENFORCE: enforce,
      },
      encoding: "utf-8",
    },
  );
  return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

for (const [label, yaml] of [
  ["tasks-claim-check.yml", workflow],
  ["the fleet init claim-check template", CLAIM_CHECK_WORKFLOW],
] as const) describe(`${label} claim gate`, () => {
  it("passes a code change that check-push allows", { timeout: SLOW_MS }, () => {
    expect(runCheck(yaml, "allow", "1").code).toBe(0);
  });

  it("blocks a genuine claim rejection with the claim message", { timeout: SLOW_MS }, () => {
    const { code, output } = runCheck(yaml, "reject", "1");
    expect(code).toBe(1);
    expect(output).toContain("code change without a live task claim");
    expect(output).not.toContain("could not run");
  });

  for (const fake of ["missing", "nocmd", "crash"]) {
    it(`reports a tooling failure (${fake}) as a tooling failure, not a claim violation`, { timeout: SLOW_MS }, () => {
      const { code, output } = runCheck(yaml, fake, "1");
      expect(code).toBe(1);
      expect(output).toContain("claim-check could not run (cli/tooling problem)");
      expect(output).not.toContain("code change without a live task claim");
    });
  }

  it("only warns on a tooling failure when enforcement is off", { timeout: SLOW_MS }, () => {
    const { code, output } = runCheck(yaml, "nocmd", "");
    expect(code).toBe(0);
    expect(output).toContain("claim-check could not run (cli/tooling problem)");
  });

  it("only warns on a claim rejection when enforcement is off", { timeout: SLOW_MS }, () => {
    const { code, output } = runCheck(yaml, "reject", "0");
    expect(code).toBe(0);
    expect(output).toContain("advisory only");
  });
});
