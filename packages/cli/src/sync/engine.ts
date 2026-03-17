import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { SyncIssue, SyncSource } from "./types.js";

function buildTaskBlock(issue: SyncIssue): string {
  const lines = [`- [ ] ${issue.title}`];
  lines.push(`  - **ID**: ${issue.id}`);
  if (issue.tags.length > 0) {
    lines.push(`  - **Tags**: ${issue.tags.join(", ")}`);
  }
  return lines.join("\n");
}

function groupByPriority(issues: SyncIssue[]): Record<number, SyncIssue[]> {
  const groups: Record<number, SyncIssue[]> = {};
  for (const issue of issues) {
    const priority = Math.max(0, Math.min(3, issue.priority));
    groups[priority] ??= [];
    groups[priority].push(issue);
  }
  return groups;
}

export function generateTasksMarkdown(issues: SyncIssue[]): string {
  const groups = groupByPriority(issues);
  const lines = ["# Tasks"];

  let hasOutput = false;
  for (const p of [0, 1, 2, 3]) {
    const bucket = groups[p];
    if (bucket?.length) {
      lines.push("", `## P${p}`, "");
      for (const issue of bucket) {
        lines.push(buildTaskBlock(issue), "");
      }
      hasOutput = true;
    }
  }

  if (!hasOutput) {
    lines.push("", "## P2", "");
  }

  return lines.join("\n");
}

function removeSyncedTasks(content: string, idPrefix: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^- \[[ x]\]/.test(line)) {
      skipBlock = false;
      // Look ahead for synced ID in metadata
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (/^\s+-\s+\*\*ID\*\*:/.test(lines[j])) {
          if (lines[j].includes(idPrefix)) {
            skipBlock = true;
          }
          break;
        }
        if (!/^\s/.test(lines[j]) && lines[j].trim() !== "") {
          break;
        }
      }
      if (skipBlock) continue;
    } else if (skipBlock) {
      if (/^\s{2,}/.test(line) || line.trim() === "") {
        continue;
      }
      skipBlock = false;
    }

    result.push(line);
  }

  return result.join("\n");
}

function ensurePrioritySection(content: string, priority: number): string {
  const heading = `## P${priority}`;
  if (content.includes(heading)) return content;

  // Find where to insert — before the next higher-numbered priority section
  for (let nextP = priority + 1; nextP <= 3; nextP++) {
    const nextHeading = `## P${nextP}`;
    const idx = content.indexOf(nextHeading);
    if (idx >= 0) {
      return content.slice(0, idx) + heading + "\n\n" + content.slice(idx);
    }
  }

  // Append at end
  return content.trimEnd() + "\n\n" + heading + "\n";
}

function insertTasksIntoPriority(content: string, priority: number, tasks: string[]): string {
  const heading = `## P${priority}`;
  const idx = content.indexOf(heading);
  if (idx < 0) return content;

  const insertPoint = idx + heading.length;
  const taskBlock = "\n\n" + tasks.join("\n\n");

  return content.slice(0, insertPoint) + taskBlock + content.slice(insertPoint);
}

export function mergeIntoExisting(
  targetPath: string,
  issues: SyncIssue[],
  idPrefix: string
): void {
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, generateTasksMarkdown(issues), "utf-8");
    return;
  }

  const existing = readFileSync(targetPath, "utf-8");

  // Remove all tasks with this source's ID prefix
  let cleaned = removeSyncedTasks(existing, idPrefix);

  // Group new issues by priority and insert
  const groups = groupByPriority(issues);

  for (const p of [0, 1, 2, 3]) {
    const bucket = groups[p];
    if (!bucket?.length) continue;

    cleaned = ensurePrioritySection(cleaned, p);
    const blocks = bucket.map(buildTaskBlock);
    cleaned = insertTasksIntoPriority(cleaned, p, blocks);
  }

  // Clean up excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

  writeFileSync(targetPath, cleaned, "utf-8");
}

export async function runSync(
  source: SyncSource,
  options: { output?: string; merge?: boolean }
): Promise<void> {
  const issues = await source.fetchIssues();

  if (issues.length === 0) {
    console.error(`No issues found from ${source.name}`);
    return;
  }

  if (options.merge && options.output) {
    mergeIntoExisting(options.output, issues, source.idPrefix);
    console.error(
      `Merged ${issues.length} ${source.name} issue(s) into ${options.output} (manual tasks preserved)`
    );
  } else if (options.output) {
    writeFileSync(options.output, generateTasksMarkdown(issues), "utf-8");
    console.error(`Wrote ${issues.length} ${source.name} issue(s) to ${options.output}`);
  } else {
    process.stdout.write(generateTasksMarkdown(issues));
  }
}
