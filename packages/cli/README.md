# @tasks-md/cli

[![npm](https://img.shields.io/npm/v/@tasks-md/cli)](https://www.npmjs.com/package/@tasks-md/cli)

A unified CLI for [TASKS.md](https://github.com/tasksmd/tasks.md) task queue management — pick tasks, lint files, sync from issue trackers, and monitor queue health.

## Install

```bash
npm install -g @tasks-md/cli
```

Or run directly with npx:

```bash
npx @tasks-md/cli pick
```

## Commands

### `tasks pick`

Pick the highest-priority unblocked, unclaimed task. Uses a deterministic algorithm: walks P0→P3, skips blocked/claimed tasks, scores by unblocking impact.

```bash
tasks pick                    # pick best task
tasks pick --tags backend     # prefer tasks tagged "backend"
```

### `tasks lint`

Validate TASKS.md files against the spec — checks structure, priority ordering, ID format, duplicate IDs, and dangling blocker references.

```bash
tasks lint TASKS.md                    # lint one file
tasks lint TASKS.md examples/          # lint multiple paths
tasks lint --fix TASKS.md              # auto-fix (removes completed tasks)
```

### `tasks stats`

Show queue overview and throughput metrics.

```bash
tasks stats
```

```
📋 Queue Overview

  P0   P1   P2   P3   Total
  1    2    5    1    9

  Blocked: 2
  Claimed: 1
  Available: 6
  Files: 1

📊 Throughput

  Completed (all time):  42
  Completed (this month): 8
  Completed (this week):  3
```

### `tasks diff`

Show queue changes since a git reference.

```bash
tasks diff              # changes since HEAD
tasks diff HEAD~5       # changes in the last 5 commits
```

### `tasks init`

Initialize a TASKS.md file in the current repo.

```bash
tasks init
```

### `tasks install`

Install the `/next-task` command for detected agents (Claude Code, Cursor, Windsurf, etc.).

```bash
tasks install
```

### `tasks sync-issues`

Sync GitHub Issues into TASKS.md.

```bash
tasks sync-issues                              # sync from current repo
tasks sync-issues --repo owner/repo            # specify repo
tasks sync-issues --label bug --merge          # filter + merge into existing file
tasks sync-issues --output TASKS.md --merge    # write to file, preserving manual tasks
```

### `tasks sync-jira`

Sync Jira issues into TASKS.md. Requires `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_TOKEN` environment variables.

```bash
tasks sync-jira --project PROJ                 # sync a project
tasks sync-jira --jql "assignee = currentUser()" --merge
tasks sync-jira --output TASKS.md --merge
```

### `tasks sync-linear`

Sync Linear issues into TASKS.md. Requires `LINEAR_API_KEY` environment variable.

```bash
tasks sync-linear --team ENG                   # sync a team's issues
tasks sync-linear --team ENG --project "Q1"    # filter by project
tasks sync-linear --output TASKS.md --merge
```

## Programmatic Usage

The CLI also exports its core functions as a library:

```typescript
import { loadAllTasks, pickBestTask, getQueueStats, getQueueDiff } from "@tasks-md/cli";

const tasks = loadAllTasks(process.cwd());
const best = pickBestTask(tasks);
const stats = getQueueStats(process.cwd());
```

## License

[MIT](../../LICENSE)
