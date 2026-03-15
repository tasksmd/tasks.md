#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

let errors = 0;
let fixed = 0;
let filesChecked = 0;
const fixMode = process.argv.includes("--fix");

function error(file, line, message) {
  console.error(`ERROR: ${file}:${line}: ${message}`);
  errors++;
}

function warn(file, line, message) {
  console.warn(`WARN: ${file}:${line}: ${message}`);
}

function validateFile(filePath, allIds, allBlockedBy) {
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    console.error(`Cannot read: ${filePath}`);
    errors++;
    return;
  }

  filesChecked++;
  const lines = content.split("\n");
  const linesToRemove = new Set();
  let lastPriority = -1;
  let inTask = false;
  let taskStartLine = 0;
  let hasMetadata = false;
  const fileIds = new Map();

  // Line 1: must be "# Tasks"
  if (lines.length < 1 || lines[0] !== "# Tasks") {
    error(filePath, 1, `first line must be '# Tasks', got '${lines[0] || ""}'`);
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Priority heading
    const priorityMatch = line.match(/^##\s+P([0-3])$/);
    if (priorityMatch) {
      const priority = parseInt(priorityMatch[1], 10);
      if (priority <= lastPriority) {
        error(filePath, lineNum, `priority heading P${priority} out of order (after P${lastPriority})`);
      }
      lastPriority = priority;
      inTask = false;
      hasMetadata = false;
      continue;
    }

    // Invalid priority headings
    if (/^##\s+P[4-9]/.test(line) || /^##\s+P\d{2,}/.test(line)) {
      error(filePath, lineNum, `invalid priority heading '${line}' (must be P0-P3)`);
      continue;
    }

    // Completed task (should be removed)
    if (/^-\s+\[x\]\s/.test(line)) {
      if (fixMode) {
        linesToRemove.add(i);
        // Also remove subsequent indented lines (metadata/subtasks)
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s{2,}/.test(lines[j]) || lines[j].trim() === "") {
            linesToRemove.add(j);
            if (lines[j].trim() === "") break;
          } else {
            break;
          }
        }
        fixed++;
        console.log(`FIX: ${filePath}:${lineNum}: removed completed task`);
      } else {
        error(filePath, lineNum, "completed task should be removed, not checked off");
      }
      continue;
    }

    // Top-level task (checkbox)
    const taskMatch = line.match(/^-\s+\[\s?\]\s+(.+)$/);
    if (taskMatch) {
      if (lastPriority < 0) {
        error(filePath, lineNum, "task found before any priority heading");
      }
      inTask = true;
      taskStartLine = lineNum;
      hasMetadata = false;
      continue;
    }

    // Non-checkbox list item under a priority heading
    if (/^-\s+/.test(line) && !/^-\s+\[.\]\s/.test(line) && lastPriority >= 0) {
      error(filePath, lineNum, `task must use checkbox format '- [ ]', got '${line}'`);
      continue;
    }

    // Indented content (metadata or subtask)
    if (/^\s{2,}/.test(line)) {
      if (!inTask) {
        // Orphaned metadata
        if (/^\s+-\s+\*\*/.test(line)) {
          error(filePath, lineNum, "orphaned metadata (no parent task)");
        }
        continue;
      }

      // ID metadata
      const idMatch = line.match(/^\s+-\s+\*\*ID\*\*:\s*(.+)$/);
      if (idMatch) {
        hasMetadata = true;
        const id = idMatch[1].trim();

        // Check kebab-case
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
          error(filePath, lineNum, `ID '${id}' must be kebab-case (lowercase letters, numbers, hyphens)`);
        }

        // Check uniqueness within file
        if (fileIds.has(id)) {
          error(filePath, lineNum, `duplicate ID '${id}' (first defined at line ${fileIds.get(id)})`);
        } else {
          fileIds.set(id, lineNum);
        }

        // Track globally
        if (allIds.has(id)) {
          error(filePath, lineNum, `duplicate ID '${id}' (also defined in ${allIds.get(id).file}:${allIds.get(id).line})`);
        } else {
          allIds.set(id, { file: filePath, line: lineNum });
        }
        continue;
      }

      // Blocked by metadata
      const blockedMatch = line.match(/^\s+-\s+\*\*Blocked by\*\*:\s*(.+)$/);
      if (blockedMatch) {
        hasMetadata = true;
        const refs = blockedMatch[1].split(",").map((r) => r.trim());
        for (const ref of refs) {
          allBlockedBy.push({ id: ref, file: filePath, line: lineNum });
        }
        continue;
      }

      // Other metadata
      if (/^\s+-\s+\*\*.+\*\*:/.test(line)) {
        hasMetadata = true;
        continue;
      }

      // Subtask
      if (/^\s+-\s+\[.\]\s/.test(line)) {
        continue;
      }

      // Continuation line (indented content under metadata)
      continue;
    }
  }

  // Apply fixes if in fix mode
  if (fixMode && linesToRemove.size > 0) {
    const fixedLines = lines.filter((_, idx) => !linesToRemove.has(idx));
    // Remove consecutive blank lines left by removals
    const cleaned = fixedLines.filter((line, idx) => {
      if (idx === 0) return true;
      return !(line.trim() === "" && fixedLines[idx - 1]?.trim() === "");
    });
    writeFileSync(filePath, cleaned.join("\n"), "utf-8");
  }
}

function discoverFiles(target) {
  const resolved = resolve(target);
  if (!existsSync(resolved)) {
    console.error(`Not found: ${resolved}`);
    process.exit(2);
  }

  const stat = statSync(resolved);
  if (stat.isFile()) {
    return [resolved];
  }

  if (stat.isDirectory()) {
    const files = [];
    for (const entry of readdirSync(resolved)) {
      if (entry.endsWith(".md")) {
        const full = join(resolved, entry);
        if (statSync(full).isFile()) {
          files.push(full);
        }
      }
    }
    return files;
  }

  return [];
}

// ── Main ──

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

const allIds = new Map();
const allBlockedBy = [];
const allFiles = args.flatMap(discoverFiles);

if (allFiles.length === 0) {
  console.error("No .md files found in the specified paths.");
  process.exit(2);
}

// First pass: collect IDs and validate structure
for (const file of allFiles) {
  validateFile(file, allIds, allBlockedBy);
}

// Second pass: validate blocker references
for (const ref of allBlockedBy) {
  if (!allIds.has(ref.id)) {
    error(ref.file, ref.line, `blocked-by references unknown ID '${ref.id}'`);
  }
}

console.log("");
if (fixMode && fixed > 0) {
  console.log(`Checked ${filesChecked} file(s), fixed ${fixed} issue(s), ${errors} remaining error(s)`);
} else {
  console.log(`Checked ${filesChecked} file(s), found ${errors} error(s)`);
}

process.exit(errors > 0 ? 1 : 0);
