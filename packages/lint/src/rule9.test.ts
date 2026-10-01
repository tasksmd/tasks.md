import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseRule9Blocks,
  classifyRule9Blocks,
  parseAllowlistFile,
} from "./rule9.js";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function lintWithFlags(content: string, flags: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-rule9-"));
  const file = join(dir, "TASKS.md");
  writeFileSync(file, content);
  try {
    const result = spawnSync("node", [CLI, ...flags, file], { encoding: "utf-8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
      dir,
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function lintWithAllowlist(content: string, allowlistLines: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "tasks-lint-rule9-"));
  const file = join(dir, "TASKS.md");
  const allow = join(dir, ".prereg-allowlist");
  writeFileSync(file, content);
  writeFileSync(allow, allowlistLines.join("\n"));
  try {
    const result = spawnSync(
      "node",
      [CLI, "--require-prereg", `--prereg-allowlist=${allow}`, file],
      { encoding: "utf-8" },
    );
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

const COMPLETE_BLOCK = [
  "- [ ] Fix auth crash",
  "  - **ID**: auth-fix",
  "  - **Hypothesis**: JWT refresh leaks 12% of sessions; aligning clock skew window to ±60s fixes it",
  "  - **Success**: refresh leak rate < 1%",
  "  - **Pivot**: refresh leak rate > 5% after fix",
  "  - **Measurement**: `pnpm run metric:refresh-leak-rate`",
  "  - **Anchor**: vision.md § 9",
].join("\n");

const MISSING_PIVOT_BLOCK = [
  "- [ ] Add metrics endpoint",
  "  - **ID**: metrics-endpoint",
  "  - **Hypothesis**: surfacing /metrics raises dashboard hit rate by 20%",
  "  - **Success**: dashboard hit rate > 50%",
  "  - **Measurement**: `curl /metrics | wc -l`",
  "  - **Anchor**: vision.md § 9",
].join("\n");

const ACCEPTANCE_BLOCK = [
  "- [ ] Refactor legacy module",
  "  - **ID**: refactor-legacy",
  "  - **Hypothesis**: extracting auth client reduces cyclomatic complexity",
  "  - **Acceptance**: All existing tests pass; complexity score drops",
  "  - **Pivot**: complexity drops by less than 5 points",
  "  - **Measurement**: `pnpm run check:complexity`",
  "  - **Anchor**: rule #12",
].join("\n");

function withWrapper(...blocks: string[]): string {
  return ["# Tasks", "", "## P0", "", ...blocks.map((b) => b + "\n"), ""].join("\n");
}

describe("parseRule9Blocks", () => {
  it("returns empty when file has no task IDs", () => {
    const blocks = parseRule9Blocks("# Tasks\n\n## P1\n\n- [ ] No ID task\n");
    expect(blocks).toHaveLength(0);
  });

  it("detects a single complete block as clean", () => {
    const blocks = parseRule9Blocks(withWrapper(COMPLETE_BLOCK));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("auth-fix");
    expect(blocks[0].missingFields).toEqual([]);
  });

  it("identifies missing fields by name", () => {
    const blocks = parseRule9Blocks(withWrapper(MISSING_PIVOT_BLOCK));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].missingFields).toEqual(["Pivot"]);
  });

  it("treats **Acceptance** as equivalent to **Success**", () => {
    const blocks = parseRule9Blocks(withWrapper(ACCEPTANCE_BLOCK));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].missingFields).toEqual([]);
  });

  it("lists multiple missing fields in declaration order", () => {
    const incomplete = [
      "- [ ] Sparse task",
      "  - **ID**: sparse-task",
      "  - **Hypothesis**: something will improve",
    ].join("\n");
    const blocks = parseRule9Blocks(withWrapper(incomplete));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].missingFields).toEqual([
      "Success/Acceptance",
      "Pivot",
      "Measurement",
      "Anchor",
    ]);
  });

  it("splits adjacent blocks by ID line", () => {
    const blocks = parseRule9Blocks(withWrapper(COMPLETE_BLOCK, MISSING_PIVOT_BLOCK));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).toBe("auth-fix");
    expect(blocks[1].id).toBe("metrics-endpoint");
  });
});

describe("classifyRule9Blocks", () => {
  it("classifies missing-field blocks not in allowlist as blocking", () => {
    const blocks = parseRule9Blocks(withWrapper(MISSING_PIVOT_BLOCK));
    const result = classifyRule9Blocks(blocks, new Set());
    expect(result.blocking).toHaveLength(1);
    expect(result.grandfathered).toHaveLength(0);
    expect(result.clean).toBe(0);
  });

  it("classifies missing-field blocks in allowlist as grandfathered", () => {
    const blocks = parseRule9Blocks(withWrapper(MISSING_PIVOT_BLOCK));
    const result = classifyRule9Blocks(blocks, new Set(["metrics-endpoint"]));
    expect(result.blocking).toHaveLength(0);
    expect(result.grandfathered).toHaveLength(1);
    expect(result.clean).toBe(0);
  });

  it("counts complete blocks as clean", () => {
    const blocks = parseRule9Blocks(withWrapper(COMPLETE_BLOCK));
    const result = classifyRule9Blocks(blocks, new Set());
    expect(result.clean).toBe(1);
    expect(result.blocking).toHaveLength(0);
  });
});

describe("parseAllowlistFile", () => {
  it("parses one ID per line and ignores blanks and comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-lint-allow-"));
    const path = join(dir, "allow.txt");
    writeFileSync(
      path,
      [
        "# grandfathered tasks",
        "auth-fix",
        "",
        "metrics-endpoint  # legacy",
        "",
        "  # comment only",
        "refactor-legacy",
      ].join("\n"),
    );
    try {
      const allow = parseAllowlistFile(path);
      expect(allow.has("auth-fix")).toBe(true);
      expect(allow.has("metrics-endpoint")).toBe(true);
      expect(allow.has("refactor-legacy")).toBe(true);
      expect(allow.size).toBe(3);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("CLI integration", () => {
  it("does NOT enforce rule-#9 fields by default", () => {
    const result = lintWithFlags(withWrapper(MISSING_PIVOT_BLOCK), []);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/rule-#9/);
  });

  it("blocks when --require-prereg is set and a field is missing", () => {
    const result = lintWithFlags(withWrapper(MISSING_PIVOT_BLOCK), ["--require-prereg"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/rule-#9 task 'metrics-endpoint' missing Pivot/);
    expect(result.stdout).toMatch(/blocking=1/);
  });

  it("passes when --require-prereg is set and all blocks are complete", () => {
    const result = lintWithFlags(withWrapper(COMPLETE_BLOCK), ["--require-prereg"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/clean=1/);
    expect(result.stdout).toMatch(/blocking=0/);
  });

  it("grandfathers an ID via --prereg-allowlist", () => {
    const result = lintWithAllowlist(withWrapper(MISSING_PIVOT_BLOCK), [
      "metrics-endpoint",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/grandfathered=1/);
    expect(result.stdout).toMatch(/blocking=0/);
  });

  it("reports remaining backfill debt in the summary line", () => {
    const result = lintWithAllowlist(
      withWrapper(COMPLETE_BLOCK, MISSING_PIVOT_BLOCK),
      ["metrics-endpoint"],
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/scanned 2 block\(s\)/);
    expect(result.stdout).toMatch(/clean=1/);
    expect(result.stdout).toMatch(/grandfathered=1/);
  });

  it("lists each missing field by name in the error message", () => {
    const sparse = [
      "- [ ] Sparse task",
      "  - **ID**: sparse-task",
    ].join("\n");
    const result = lintWithFlags(withWrapper(sparse), ["--require-prereg"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /sparse-task' missing Hypothesis, Success\/Acceptance, Pivot, Measurement, Anchor/,
    );
  });
});
