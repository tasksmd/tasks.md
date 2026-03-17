import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTasksContent, type Task } from "@tasks-md/parser";

interface IdLocation {
  file: string;
  line: number;
}

interface BlockerRef {
  id: string;
  file: string;
  line: number;
}

export interface LintResult {
  errors: number;
  fixed: number;
  filesChecked: number;
}

function findMetadataLine(task: Task, pattern: RegExp): number {
  const offset = task.rawLines.findIndex((line) => pattern.test(line));
  return offset >= 0 ? task.startLine + offset : task.startLine;
}

export function lintFiles(filePaths: string[], fixMode: boolean): LintResult {
  let errors = 0;
  let fixed = 0;
  let filesChecked = 0;
  const allIds = new Map<string, IdLocation>();
  const allBlockedBy: BlockerRef[] = [];

  function reportError(file: string, line: number, message: string): void {
    console.error(`ERROR: ${file}:${line}: ${message}`);
    errors++;
  }

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      console.error(`Cannot read: ${filePath}`);
      errors++;
      continue;
    }

    filesChecked++;
    const lines = content.split("\n");
    const linesToRemove = new Set<number>();
    let lastPriority = -1;
    let inTask = false;

    // Line 1: must be "# Tasks"
    if (lines.length < 1 || lines[0] !== "# Tasks") {
      reportError(filePath, 1, `first line must be '# Tasks', got '${lines[0] ?? ""}'`);
    }

    for (let i = 1; i < lines.length; i++) {
      if (linesToRemove.has(i)) continue;
      const line = lines[i];
      const lineNum = i + 1;

      // Priority heading
      const priorityMatch = line.match(/^##\s+P([0-3])$/);
      if (priorityMatch) {
        const priority = parseInt(priorityMatch[1], 10);
        if (priority <= lastPriority) {
          reportError(filePath, lineNum, `priority heading P${priority} out of order (after P${lastPriority})`);
        }
        lastPriority = priority;
        inTask = false;
        continue;
      }

      // Invalid priority headings
      if (/^##\s+P[4-9]/.test(line) || /^##\s+P\d{2,}/.test(line)) {
        reportError(filePath, lineNum, `invalid priority heading '${line}' (must be P0-P3)`);
        continue;
      }

      // Completed task (should be removed)
      if (/^-\s+\[x\]\s/.test(line)) {
        if (fixMode) {
          linesToRemove.add(i);
          for (let j = i + 1; j < lines.length; j++) {
            if (/^\s{2,}/.test(lines[j]) || lines[j].trim() === "") {
              linesToRemove.add(j);
              if (lines[j].trim() === "") break;
            } else break;
          }
          fixed++;
          console.log(`FIX: ${filePath}:${lineNum}: removed completed task`);
        } else {
          reportError(filePath, lineNum, "completed task should be removed, not checked off");
        }
        continue;
      }

      // Top-level task (checkbox)
      if (line.match(/^-\s+\[\s?\]\s+(.+)$/)) {
        if (lastPriority < 0) {
          reportError(filePath, lineNum, "task found before any priority heading");
        }
        inTask = true;
        continue;
      }

      // Non-checkbox list item under a priority heading
      if (/^-\s+/.test(line) && !/^-\s+\[.\]\s/.test(line) && lastPriority >= 0) {
        reportError(filePath, lineNum, `task must use checkbox format '- [ ]', got '${line}'`);
        continue;
      }

      // Indented content (metadata or subtask)
      if (/^\s{2,}/.test(line)) {
        if (!inTask && /^\s+-\s+\*\*/.test(line)) {
          reportError(filePath, lineNum, "orphaned metadata (no parent task)");
        }
        continue;
      }
    }

    // Apply fixes if in fix mode
    if (fixMode && linesToRemove.size > 0) {
      const fixedLines = lines.filter((_, idx) => !linesToRemove.has(idx));
      const cleaned = fixedLines.filter((l, idx) => {
        if (idx === 0) return true;
        return !(l.trim() === "" && fixedLines[idx - 1]?.trim() === "");
      });
      writeFileSync(filePath, cleaned.join("\n"), "utf-8");
    }

    // Semantic validation via shared parser — IDs and blockers
    const tasks = parseTasksContent(content, filePath);
    for (const task of tasks) {
      if (task.metadata.id) {
        const id = task.metadata.id;
        const idLine = findMetadataLine(task, /^\s+-\s+\*\*ID\*\*:/);

        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
          reportError(filePath, idLine, `ID '${id}' must be kebab-case (lowercase letters, numbers, hyphens)`);
        }

        if (allIds.has(id)) {
          const existing = allIds.get(id)!;
          if (existing.file === filePath) {
            reportError(filePath, idLine, `duplicate ID '${id}' (first defined at line ${existing.line})`);
          } else {
            reportError(filePath, idLine, `duplicate ID '${id}' (also defined in ${existing.file}:${existing.line})`);
          }
        } else {
          allIds.set(id, { file: filePath, line: idLine });
        }
      }

      if (task.metadata.blockedBy) {
        const blockerLine = findMetadataLine(task, /^\s+-\s+\*\*Blocked by\*\*:/);
        for (const ref of task.metadata.blockedBy) {
          allBlockedBy.push({ id: ref, file: filePath, line: blockerLine });
        }
      }
    }
  }

  // Second pass: validate blocker references
  for (const ref of allBlockedBy) {
    if (!allIds.has(ref.id)) {
      reportError(ref.file, ref.line, `blocked-by references unknown ID '${ref.id}'`);
    }
  }

  return { errors, fixed, filesChecked };
}

export function discoverFiles(target: string): string[] {
  const resolved = resolve(target);
  if (!existsSync(resolved)) {
    console.error(`Not found: ${resolved}`);
    process.exit(2);
  }

  const stat = statSync(resolved);
  if (stat.isFile()) return [resolved];

  if (stat.isDirectory()) {
    return readdirSync(resolved)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => join(resolved, entry))
      .filter((full) => statSync(full).isFile());
  }

  return [];
}
