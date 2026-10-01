#!/usr/bin/env node

import { lintFiles, discoverFiles } from "./lint.js";
import { lintRule9Content, parseAllowlistFile } from "./rule9.js";
import { readFileSync } from "node:fs";

const fixMode = process.argv.includes("--fix");
const requirePrereg = process.argv.includes("--require-prereg");

let prereggAllowlistPath: string | undefined;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--prereg-allowlist=")) {
    prereggAllowlistPath = arg.slice("--prereg-allowlist=".length);
  }
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (args.length === 0) {
  console.log("Usage: tasks-lint [--fix] [--require-prereg] [--prereg-allowlist=<file>] <file|directory> [file|directory...]");
  console.log("");
  console.log("Validates TASKS.md files against the spec.");
  console.log("Options:");
  console.log("  --fix                       Auto-fix removable issues (completed tasks)");
  console.log("  --require-prereg            Enforce rule-#9 pre-registration fields on every task block");
  console.log("                              (**Hypothesis**, **Success**/**Acceptance**, **Pivot**, **Measurement**, **Anchor**)");
  console.log("  --prereg-allowlist=<file>   Allowlist file (one ID per line) for grandfathered tasks");
  console.log("Exits 0 on success, 1 on validation errors, 2 on usage errors.");
  process.exit(2);
}

const allFiles = args.flatMap(discoverFiles);

if (allFiles.length === 0) {
  console.error("No .md files found in the specified paths.");
  process.exit(2);
}

const { errors, fixed, filesChecked } = lintFiles(allFiles, fixMode);

let prereggErrors = 0;
let prereggBlocksScanned = 0;
let prereggClean = 0;
let prereggGrandfathered = 0;

if (requirePrereg) {
  const allowlist: ReadonlySet<string> = prereggAllowlistPath
    ? parseAllowlistFile(prereggAllowlistPath)
    : new Set();

  for (const file of allFiles) {
    const content = readFileSync(file, "utf-8");
    const report = lintRule9Content(content, allowlist);
    prereggBlocksScanned += report.blocksScanned;
    prereggClean += report.clean;
    prereggGrandfathered += report.grandfathered;
    for (const b of report.blocking) {
      console.error(
        `ERROR: ${file}: rule-#9 task '${b.id}' missing ${b.missingFields.join(", ")}; ` +
          `add the field(s) — see https://github.com/tasksmd/tasks.md/blob/main/spec.md#rule-9-pre-registration-block`,
      );
      prereggErrors++;
    }
  }
}

const totalErrors = errors + prereggErrors;

console.log("");
if (fixMode && fixed > 0) {
  console.log(`Checked ${filesChecked} file(s), fixed ${fixed} issue(s), ${totalErrors} remaining error(s)`);
} else {
  console.log(`Checked ${filesChecked} file(s), found ${totalErrors} error(s)`);
}

if (requirePrereg) {
  console.log(
    `rule-#9 pre-registration: scanned ${prereggBlocksScanned} block(s); ` +
      `clean=${prereggClean}, grandfathered=${prereggGrandfathered}, blocking=${prereggErrors}`,
  );
}

process.exit(totalErrors > 0 ? 1 : 0);
