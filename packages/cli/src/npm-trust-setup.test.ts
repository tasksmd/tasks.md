import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/setup-npm-trusted-publishing.sh is the one-time owner step that lets
// publish.yml publish through npm Trusted Publishing. It must be idempotent and
// must never replace a trust rule it did not create. npm is stubbed here.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(repoRoot, "scripts", "setup-npm-trusted-publishing.sh");
const PACKAGES = ["@tasks-md/parser", "@tasks-md/lint", "@tasks-md/cli", "tasks-mcp"];

// Fake npm. State lives in $FAKE_STATE: one file per package with its trust
// list, plus `calls` (one line per `npm trust github`).
const FAKE_NPM = `#!/bin/sh
key() { echo "$1" | tr '/@' '__'; }
case "$1" in
  --version) echo "\${FAKE_NPM_VERSION:-12.2.0}"; exit 0 ;;
  whoami) [ "$FAKE_LOGGED_IN" = "1" ] && { echo owner; exit 0; }; echo "npm error code ENEEDAUTH" >&2; exit 1 ;;
  trust)
    f="$FAKE_STATE/$(key "$3")"
    if [ "$2" = "list" ]; then
      if [ -f "$f" ]; then cat "$f"; else echo "[]"; fi
      exit 0
    fi
    if [ "$2" = "github" ]; then
      echo "$3 $*" >> "$FAKE_STATE/calls"
      echo '[{"id":"t1","type":"github","claims":{"repository":"tasksmd/tasks.md","workflow_ref":{"file":"publish.yml"}}}]' > "$f"
      exit 0
    fi
    if [ "$2" = "revoke" ]; then echo "revoke $3" >> "$FAKE_STATE/calls"; exit 0; fi
    ;;
esac
echo "unexpected npm call: $*" >&2
exit 2
`;

let dir: string;
let state: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-npm-trust-"));
  state = join(dir, "state");
  mkdirSync(join(dir, "bin"));
  mkdirSync(state);
  writeFileSync(join(dir, "bin", "npm"), FAKE_NPM);
  chmodSync(join(dir, "bin", "npm"), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(env: Record<string, string>): { code: number; output: string } {
  const result = spawnSync("bash", [SCRIPT], {
    cwd: dir,
    env: {
      ...process.env,
      // A BASH_ENV startup file can reset PATH and hide the fake npm.
      BASH_ENV: "",
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      FAKE_STATE: state,
      TRUST_SLEEP_SECONDS: "0",
      ...env,
    },
    encoding: "utf-8",
  });
  return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

function trustCalls(): string[] {
  const path = join(state, "calls");
  return existsSync(path) ? readFileSync(path, "utf-8").trim().split("\n") : [];
}

describe("setup-npm-trusted-publishing.sh", () => {
  it("tells the owner to npm login and writes nothing when logged out", () => {
    const { code, output } = run({ FAKE_LOGGED_IN: "0" });
    expect(code).toBe(1);
    expect(output).toContain("npm login");
    expect(trustCalls()).toEqual([]);
  });

  it("refuses an npm that is too old for npm trust", () => {
    const { code, output } = run({ FAKE_LOGGED_IN: "1", FAKE_NPM_VERSION: "10.9.2" });
    expect(code).toBe(1);
    expect(output).toContain("too old");
    expect(trustCalls()).toEqual([]);
  });

  it("trusts publish.yml for all four packages, then is a no-op on re-run", () => {
    const first = run({ FAKE_LOGGED_IN: "1" });
    expect(first.code).toBe(0);
    const calls = trustCalls();
    expect(calls.map((line) => line.split(" ")[0])).toEqual(PACKAGES);
    for (const line of calls) {
      expect(line).toContain("--file publish.yml --repo tasksmd/tasks.md --allow-publish -y");
    }

    const second = run({ FAKE_LOGGED_IN: "1" });
    expect(second.code).toBe(0);
    expect(trustCalls()).toHaveLength(PACKAGES.length);
    expect(second.output).toContain("already trusts tasksmd/tasks.md");
  });

  it("reports, but never revokes, a different existing trusted publisher", () => {
    writeFileSync(
      join(state, "_tasks-md_cli"),
      '[{"id":"other","type":"github","claims":{"repository":"someone/fork","workflow_ref":{"file":"release.yml"}}}]',
    );
    const { code, output } = run({ FAKE_LOGGED_IN: "1" });
    expect(code).toBe(1);
    expect(output).toContain("@tasks-md/cli: trusts a different publisher");
    expect(trustCalls().map((line) => line.split(" ")[0])).toEqual(
      PACKAGES.filter((pkg) => pkg !== "@tasks-md/cli"),
    );
    expect(trustCalls().join("\n")).not.toContain("revoke");
  });
});
