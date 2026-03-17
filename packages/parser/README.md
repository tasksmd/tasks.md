# @tasks-md/parser

Parser for [TASKS.md](https://github.com/tasksmd/tasks.md) files — extracts tasks, metadata, priorities, and blockers.

## Install

```bash
npm install @tasks-md/parser
```

## Usage

```ts
import { parseTasksContent, isBlocked, getAllTaskIds } from "@tasks-md/parser";

const content = `# Tasks

## P0

- [ ] Fix login crash
  - **ID**: fix-login
  - **Tags**: bug, auth

## P1

- [ ] Add dark mode
  - **ID**: dark-mode
  - **Blocked by**: fix-login
`;

const tasks = parseTasksContent(content, "TASKS.md");
// → [{ summary: 'Fix login crash', priority: 'P0', metadata: { id: 'fix-login', ... } }, ...]

const ids = getAllTaskIds([{ path: "TASKS.md", tasks }]);
// → Set { 'fix-login', 'dark-mode' }

const blocked = isBlocked(tasks[1], ids);
// → true (dark-mode is blocked by fix-login which exists)
```

### File discovery

```ts
import { discoverTaskFiles, loadAllTasks } from "@tasks-md/parser";

// Find all TASKS.md files from a git root
const files = discoverTaskFiles("/path/to/repo");
// → ['TASKS.md', 'packages/api/TASKS.md']

// Load and parse all at once
const taskFiles = loadAllTasks("/path/to/repo");
// → [{ path: 'TASKS.md', tasks: [...] }, ...]
```

## Types

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
}

interface TaskFile {
  path: string;
  tasks: Task[];
}
```

## License

[MIT](../../LICENSE)
