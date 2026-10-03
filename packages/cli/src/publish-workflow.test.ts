import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The main rulesets reject a direct push (non-fast-forward + the required
// claim-check), so publish.yml must not push the version bump back to main.
// Versions are bumped in a PR before tagging; the workflow only checks them.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "publish.yml"), "utf-8");
const CHECK_STEP = "Check package versions match the tag";
const PACKAGES = ["parser", "lint", "mcp", "cli"];

// Return the `run: |` block of the named step, de-indented.
function stepRun(yaml: string, name: string): string {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start < 0) throw new Error(`publish.yml has no step named "${name}"`);
  const run = lines.findIndex((line, index) => index > start && line.trim() === "run: |");
  const indent = (lines[run + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

// Spawns ~10 short node processes per fixture; allow for a loaded machine.
const SLOW_MS = 120_000;

let dir: string;

function makeFixture(): void {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-publish-"));
  mkdirSync(join(dir, "scripts"));
  copyFileSync(join(repoRoot, "scripts", "sync-versions.sh"), join(dir, "scripts", "sync-versions.sh"));
  for (const pkg of PACKAGES) {
    mkdirSync(join(dir, "packages", pkg), { recursive: true });
    copyFileSync(
      join(repoRoot, "packages", pkg, "package.json"),
      join(dir, "packages", pkg, "package.json"),
    );
  }
  execFileSync("bash", ["scripts/sync-versions.sh", "1.2.3"], { cwd: dir, stdio: "ignore" });
  // Stage the bumped files: `git diff` compares the work tree with the index,
  // which equals HEAD in the workflow's fresh checkout.
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "."], { cwd: dir });
}

function runCheck(version: string): { code: number; output: string } {
  const script = stepRun(workflow, CHECK_STEP);
  try {
    const output = execFileSync("bash", ["-e", "-c", script], {
      cwd: dir,
      env: { ...process.env, VERSION: version },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const failed = error as { status: number; stdout: string };
    return { code: failed.status, output: failed.stdout };
  }
}

describe("publish workflow", () => {
  it("never pushes to main and needs only read access to contents", () => {
    expect(workflow).not.toContain("git push");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
  });

  it("checks versions before it publishes", () => {
    const check = workflow.indexOf(`- name: ${CHECK_STEP}`);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(workflow.indexOf("- name: Publish packages to npm"));
  });

  describe("version check step", () => {
    beforeEach(makeFixture, SLOW_MS);
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("passes when the tag matches the bumped package versions", () => {
      expect(runCheck("1.2.3").code).toBe(0);
    }, SLOW_MS);

    it("fails with a fix hint when the tag does not match", () => {
      const result = runCheck("1.2.4");
      expect(result.code).not.toBe(0);
      expect(result.output).toContain("::error::");
      expect(result.output).toContain("bash scripts/sync-versions.sh 1.2.4");
    }, SLOW_MS);
  });
});
