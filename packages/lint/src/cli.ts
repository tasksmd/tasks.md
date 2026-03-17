#!/usr/bin/env node

import { lintFiles, discoverFiles } from "./lint.js";

const fixMode = process.argv.includes("--fix");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (args.length === 0) {
  console.log("Usage: tasks-lint [--fix] <file|directory> [file|directory...]");
  console.log("");
  console.log("Validates TASKS.md files against the spec.");
  console.log("Options:");
  console.log("  --fix    Auto-fix removable issues (completed tasks)");
  console.log("Exits 0 on success, 1 on validation errors, 2 on usage errors.");
  process.exit(2);
}

const allFiles = args.flatMap(discoverFiles);

if (allFiles.length === 0) {
  console.error("No .md files found in the specified paths.");
  process.exit(2);
}

const { errors, fixed, filesChecked } = lintFiles(allFiles, fixMode);

console.log("");
if (fixMode && fixed > 0) {
  console.log(`Checked ${filesChecked} file(s), fixed ${fixed} issue(s), ${errors} remaining error(s)`);
} else {
  console.log(`Checked ${filesChecked} file(s), found ${errors} error(s)`);
}

process.exit(errors > 0 ? 1 : 0);
