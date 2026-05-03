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

Pick the highest-priority unblocked, unclaimed task. Uses a deterministic algorithm: walks P0→P3, skips blocked, claimed, and `standing-loop` tasks, scores by unblocking impact.

```bash
tasks pick                    # pick best task
tasks pick --tags backend     # prefer tasks tagged "backend"
```

### `tasks list`

List every task that matches the given filters — the CLI counterpart of the MCP `list_tasks` tool. Same filter predicates and sort order, so scripts can use either backend.

```bash
tasks list                                # every task, P0 first
tasks list --priority P0                  # only P0 tasks
tasks list --tag backend                  # only backend-tagged tasks
tasks list --unclaimed --unblocked        # only pickable work
tasks list --priority P0 --json           # structured JSON output
```

Default output is one line per task: `<priority>\t<id>\t<summary>` (tab-separated, `-` for tasks with no ID). `--json` returns an array of `{ id, summary, priority, tags, blocked, claimed, file, line }` records that round-trips through `JSON.parse`.

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
tasks install --all       # install for all agents, even if directories don't exist
tasks install --hooks     # also install pre-commit hook for TASKS.md validation
```

### `tasks watch`

Watch TASKS.md files for changes and auto-lint on save.

```bash
tasks watch               # watch current directory
tasks watch ./packages    # watch a specific directory
tasks watch --fix         # auto-lint and auto-fix on every save
```

`--fix` reuses the same fix path as `tasks lint --fix`: removes `- [x]` completed tasks (and their metadata) in place, then re-runs lint on the fixed content. Other lint errors are reported but not auto-fixed.

### `tasks generate-commands`

Regenerate agent-specific command files from the canonical sources (`commands/next-task.md` and `commands/lint-tasks.md`). Used after editing a canonical command to propagate changes to all 6 agent variants for that command. The CI `commands-drift` job runs this on every PR and rejects diffs in `commands/`.

```bash
tasks generate-commands
```

### `tasks sync <provider>`

Sync issues from an external tracker into TASKS.md. Provider is one of `github`, `jira`, or `linear`. The legacy commands `tasks sync-issues`, `tasks sync-jira`, and `tasks sync-linear` are kept as deprecated aliases for one minor version — they print a warning and forward to the new form.

#### `tasks sync github`

Sync GitHub Issues into TASKS.md. Requires the `gh` CLI to be authenticated (`gh auth login`).

```bash
tasks sync github                              # sync from current repo
tasks sync github --repo owner/repo            # specify repo
tasks sync github --label bug --merge          # filter + merge into existing file
tasks sync github --output TASKS.md --merge    # write to file, preserving manual tasks
```

**Priority mapping** — GitHub labels map to TASKS.md priorities. The highest-priority (lowest number) label wins when multiple are present:

| GitHub Label | Priority |
|-------------|----------|
| `critical`, `p0` | P0 |
| `high`, `p1` | P1 |
| `medium`, `p2` | P2 (default) |
| `low`, `p3` | P3 |

**Tag extraction** — Labels that aren't the filter label (default: `tasks.md`) and aren't priority labels become tags. For example, an issue with labels `tasks.md`, `p1`, `frontend`, `api` produces tags `frontend, api`.

**ID format** — Each synced issue gets an ID like `issue-42` (the `issue-` prefix plus the GitHub issue number).

#### `tasks sync jira`

Sync Jira issues into TASKS.md. Requires `JIRA_URL` and `JIRA_TOKEN` environment variables. Set `JIRA_AUTH=bearer` for Bearer token auth (default is Basic).

```bash
tasks sync jira --project PROJ                 # sync a project
tasks sync jira --jql "assignee = currentUser()" --merge
tasks sync jira --output TASKS.md --merge
tasks sync jira --max 50                       # limit results
```

**Priority mapping** — Jira priority names map to TASKS.md priorities:

| Jira Priority | Priority |
|--------------|----------|
| Highest, Blocker, Critical | P0 |
| High | P1 |
| Medium | P2 (default) |
| Low, Lowest | P3 |

**Tag extraction** — Jira issue labels are lowercased and used as tags.

**ID format** — Each synced issue gets an ID like `jira-PROJ-42`.

#### `tasks sync linear`

Sync Linear issues into TASKS.md. Requires `LINEAR_API_KEY` environment variable.

```bash
tasks sync linear --team ENG                   # sync a team's issues
tasks sync linear --team ENG --project "Q1"    # filter by project
tasks sync linear --filter '{"assignee":{"id":{"eq":"me"}}}'  # custom filter
tasks sync linear --output TASKS.md --merge
tasks sync linear --max 50                     # limit results
```

**Priority mapping** — Linear numeric priorities map to TASKS.md priorities:

| Linear Priority | Priority |
|----------------|----------|
| 1 (Urgent) | P0 |
| 2 (High) | P1 |
| 3 (Medium) | P2 |
| 4 (Low), 0 (No priority) | P3 |

**Tag extraction** — Linear label names are lowercased with spaces replaced by hyphens (e.g., "Bug Fix" becomes `bug-fix`).

**ID format** — Each synced issue gets an ID like `linear-ENG-42`.

### Merge behavior

When using `--merge`, sync preserves manual tasks you've added by hand. It:
1. Removes all previously synced tasks (matched by ID prefix, e.g., `issue-`, `jira-`, `linear-`)
2. Inserts the current set of open issues under the correct priority headings
3. Leaves all other tasks untouched

This means closed issues are automatically removed on the next sync, and new issues appear in the right priority section.

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
