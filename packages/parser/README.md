# @tasks-md/parser

[![npm](https://img.shields.io/npm/v/@tasks-md/parser)](https://www.npmjs.com/package/@tasks-md/parser)

Parser for [TASKS.md](https://github.com/tasksmd/tasks.md) files — extracts tasks, metadata, priorities, blockers, and policies.

> **Scope: file format, not backend state.** This package parses the markdown *format* — a `claimed?` field here is just the parsed `(@agent)` suffix on a line, not a backend claim. Collision-free claiming, leases, and the git-native event log live in the [`@tasks-md/cli`](../cli/) backends and [`spec.md` § Task backends](../../spec.md#task-backends); the parser is backend-agnostic and reads whatever `TASKS.md` it is given (including a git-native generated snapshot).

## Install

```bash
npm install @tasks-md/parser
```

## Use

```ts
import { loadAllTasks, pickBestTask, isBlocked, getAllTaskIds } from "@tasks-md/parser";

const taskFiles = loadAllTasks(process.cwd());        // discover every TASKS.md from the git root
const allIds = getAllTaskIds(taskFiles);
const result = pickBestTask(taskFiles);               // walks P0→P3, skips blocked / claimed / standing-loop
if (result) {
  const stillBlocked = isBlocked(result.task, allIds);
}
```

`@tasks-md/cli`, `@tasks-md/lint`, and `tasks-mcp` all call into this package — they share one parser and one pick algorithm so behavior cannot drift across surfaces.

## API

```ts
parseTasksContent(content: string, filePath: string): Task[]
parsePolicies(content: string): Policy[]
discoverTaskFiles(directory: string): string[]
loadAllTasks(directory: string): TaskFile[]
loadAllTasksAsync(directory: string): Promise<TaskFile[]>
findGitRoot(directory: string): string

getAllTaskIds(taskFiles: TaskFile[]): Set<string>
isBlocked(task: Task, allIds: Set<string>): boolean
pickBestTask(taskFiles: TaskFile[], tags?: string[], agentName?: string): PickResult | undefined
findTasksById(taskFiles: TaskFile[], taskId: string): Task[]
normalizeTaskId(taskId: string): string
countUnblocks(task: Task, allTasks: Task[]): number
tagOverlapCount(task: Task, tags: string[]): number
```

```ts
interface Task {
  summary: string;
  priority: string;
  claimed?: string;
  metadata: TaskMetadata;
  subtasks: string[];
  file: string;
  startLine: number;
  endLine: number;
  rawLines: string[];
}

interface TaskMetadata {
  id?: string;
  tags?: string[];
  details?: string;
  files?: string[];
  acceptance?: string;
  blockedBy?: string[];
  blocked?: string;        // free-form external-constraint reason
  research?: string;       // agent-managed research notes
  lastEnriched?: string;   // ISO date YYYY-MM-DD
  [key: string]: string | string[] | undefined;
}

interface Policy {
  text: string;
  scope: "file" | string;  // "file" or "P0".."P3"
}

interface TaskFile {
  path: string;
  tasks: Task[];
  policies?: Policy[];
}

interface PickResult {
  task: Task;
  candidateCount: number;
  unblocksCount: number;
  resumed?: boolean;
}
```

`pickBestTask` is the single source of truth for queue ordering: walks `P0 → P1 → P2 → P3`, drops tasks that are claimed, blocked (non-empty `**Blocked**` OR a `**Blocked by**` ID still present in the queue), or carry the `standing-loop` tag. Within a priority it sorts by descending unblocking impact, then by descending tag overlap. Pass `agentName` to resume a prior claim before walking the queue.

## See also

- [Specification](../../spec.md) — the canonical TASKS.md format
- [Root README](../../README.md) — project overview and quick start
- [`@tasks-md/cli`](../cli/) — CLI built on this parser
- [`@tasks-md/lint`](../lint/) — linter built on this parser
- [`tasks-mcp`](../mcp/) — MCP server built on this parser

## License

[MIT](../../LICENSE)
