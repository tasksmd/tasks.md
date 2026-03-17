import { watch } from "node:fs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { lintFiles } from "@tasks-md/lint";

export interface LintResult {
  success: boolean;
  errors: number;
}

export function discoverWatchFiles(directory: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (entry === "TASKS.md") {
          results.push(fullPath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }

  walk(directory);
  return results;
}

export function lintTaskFile(filePath: string): LintResult {
  const { errors } = lintFiles([filePath], false);
  return { success: errors === 0, errors };
}

export function startWatching(directory: string): void {
  const files = discoverWatchFiles(directory);

  if (files.length === 0) {
    console.error(`No TASKS.md files found in ${directory}`);
    process.exit(1);
  }

  console.log(`\x1b[32mWatching ${files.length} file(s) for changes:\x1b[0m`);
  for (const file of files) {
    console.log(`  \x1b[2m${file}\x1b[0m`);
  }
  console.log("");
  console.log("\x1b[2mPress Ctrl+C to stop.\x1b[0m");

  for (const file of files) {
    runLint(file);
  }

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  for (const file of files) {
    watch(file, () => {
      const existing = debounceTimers.get(file);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        file,
        setTimeout(() => {
          debounceTimers.delete(file);
          runLint(file);
        }, 500),
      );
    });
  }

  process.on("SIGINT", () => {
    console.log("");
    console.log("\x1b[2mStopped watching.\x1b[0m");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("");
    console.log("\x1b[2mStopped watching.\x1b[0m");
    process.exit(0);
  });
}

function runLint(file: string): void {
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log("");
  console.log(`\x1b[2m[${timestamp}] Change detected: ${basename(file)}\x1b[0m`);
  const result = lintTaskFile(file);
  if (result.success) {
    console.log("\x1b[32m✓ No issues\x1b[0m");
  } else {
    console.log("\x1b[31m✗ Lint errors found\x1b[0m");
  }
}
