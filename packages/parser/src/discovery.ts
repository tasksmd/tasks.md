import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseTasksContent } from "./index.js";
import type { TaskFile } from "./index.js";

export function findGitRoot(startDir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    }).trim();
  } catch {
    return startDir;
  }
}

/** True when `dir` is a filesystem root (`/` or `C:\`). Never recurse from here. */
export function isFilesystemRoot(dir: string): boolean {
  const resolved = resolve(dir);
  if (resolved === "/") return true;
  // Windows drive roots: C:\ or C:/
  return /^[A-Za-z]:[\\/]?$/.test(resolved);
}

/**
 * Resolve where TASKS.md discovery may recurse.
 * Recursive scans require a real git root — non-git cwd (e.g. LaunchAgent `/`)
 * only checks for a direct `TASKS.md` in that directory.
 */
export function resolveDiscoveryScope(directory: string): {
  root: string;
  recursive: boolean;
} {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    }).trim();
    return { root, recursive: !isFilesystemRoot(root) };
  } catch {
    return { root: directory, recursive: false };
  }
}

function directTaskFile(directory: string): string[] {
  const direct = join(directory, "TASKS.md");
  try {
    if (existsSync(direct) && statSync(direct).isFile()) return [direct];
  } catch {
    // inaccessible
  }
  return [];
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
  const { root, recursive } = resolveDiscoveryScope(directory);

  // Belt-and-suspenders: never let fd / walk start at filesystem root.
  if (isFilesystemRoot(root)) return [];

  if (!recursive) {
    return directTaskFile(root);
  }

  try {
    const output = execSync(
      'fd --no-ignore-vcs --exclude node_modules -t f "^TASKS\\.md$"',
      { cwd: root, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 }
    ).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((file) => join(root, file))
      .sort();
  } catch {
    return walkForTaskFiles(root).sort();
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
