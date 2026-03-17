import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTasksContent } from "./index.js";
import type { TaskFile } from "./index.js";

export function findGitRoot(startDir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return startDir;
  }
}

function walkForTaskFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkForTaskFiles(fullPath));
      } else if (entry === "TASKS.md") {
        results.push(fullPath);
      }
    } catch {
      // Skip inaccessible entries
    }
  }
  return results;
}

export function discoverTaskFiles(directory: string): string[] {
  const gitRoot = findGitRoot(directory);
  try {
    const output = execSync(
      'fd --no-ignore-vcs --exclude node_modules -t f "^TASKS\\.md$"',
      { cwd: gitRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((file) => join(gitRoot, file))
      .sort();
  } catch {
    return walkForTaskFiles(gitRoot).sort();
  }
}

export function loadAllTasks(directory: string): TaskFile[] {
  const files = discoverTaskFiles(directory);
  const results: TaskFile[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      results.push({ path: file, tasks: parseTasksContent(content, file) });
    } catch {
      // Skip unreadable files
    }
  }
  return results;
}

export async function loadAllTasksAsync(directory: string): Promise<TaskFile[]> {
  const files = discoverTaskFiles(directory);
  const results: TaskFile[] = [];
  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8");
      results.push({ path: file, tasks: parseTasksContent(content, file) });
    } catch {
      // Skip unreadable files
    }
  }
  return results;
}
