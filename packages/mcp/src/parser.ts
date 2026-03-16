import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { parseTasksContent } from "@tasks-md/parser";
import type { TaskFile } from "@tasks-md/parser";

// Re-export all types and pure functions from the shared parser
export {
  parseTasksContent,
  getAllTaskIds,
  isBlocked,
  type Task,
  type TaskFile,
  type TaskMetadata,
} from "@tasks-md/parser";

// I/O-dependent functions that stay in the MCP package

function findGitRoot(startDir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return startDir;
  }
}

export function discoverTaskFiles(directory: string): string[] {
  const gitRoot = findGitRoot(directory);
  try {
    const output = execSync(
      'fd --no-ignore-vcs -t f "^TASKS\\.md$"',
      { cwd: gitRoot, encoding: "utf-8" }
    ).trim();
    if (!output) return [];
    return output.split("\n").map((file) => join(gitRoot, file));
  } catch {
    // fd not available — check root only
    return [join(gitRoot, "TASKS.md")];
  }
}

export async function parseTaskFile(filePath: string): Promise<TaskFile> {
  const content = await readFile(filePath, "utf-8");
  return {
    path: filePath,
    tasks: parseTasksContent(content, filePath),
  };
}

export async function loadAllTasks(directory: string): Promise<TaskFile[]> {
  const files = discoverTaskFiles(directory);
  const results: TaskFile[] = [];
  for (const file of files) {
    try {
      results.push(await parseTaskFile(file));
    } catch {
      // Skip files that can't be read
    }
  }
  return results;
}

export function getRelativePath(filePath: string, baseDir: string): string {
  return relative(baseDir, filePath);
}
