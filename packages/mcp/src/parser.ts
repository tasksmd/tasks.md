import { relative } from "node:path";

// Re-export all types, pure functions, and discovery functions from the shared parser
export {
  parseTasksContent,
  getAllTaskIds,
  isBlocked,
  discoverTaskFiles,
  findGitRoot,
  loadAllTasksAsync as loadAllTasks,
  type Task,
  type TaskFile,
  type TaskMetadata,
} from "@tasks-md/parser";

export function getRelativePath(filePath: string, baseDir: string): string {
  return relative(baseDir, filePath);
}
