# User Story: Monitor Queue Health at a Glance

> I want to see how my task queue is performing — what's pending, what's getting done, and what changed recently.

## Quick Overview

```bash
tasks stats
```

```
📋 Queue Overview

  P0   P1   P2   P3   Total
  0    2    5    0    7

  Blocked: 1
  Claimed: 0
  Available: 6
  Files: 1

📊 Throughput

  Completed (all time):  53
  Completed (this month): 12
  Completed (this week):  4

  Top agents:
    @cursor: 28 task(s)
    @claude: 15 task(s)
```

One command shows queue size by priority, how many tasks are blocked or claimed, throughput over time, and which agents are doing the most work.

## Pick the Next Task

```bash
tasks pick                       # pick the highest-priority available task
tasks pick --tags backend        # prefer backend-tagged tasks (soft preference)
tasks pick --tags backend,api    # multiple tags — at least one must overlap
```

`tasks pick` is the read-only inspection paired with `/next-task`. Same algorithm — same priority sort, same blocker resolution, same `standing-loop` skip — but it makes no claim, no commit, and no file edit. Use it for human inspection ("what would the agent pick?") or for scripts that need the next-up task without claiming it.

Output shape on a hit:

```
Picked "Fix the crash on startup" (P0)
  File: TASKS.md:5
  ID: fix-startup-crash
  Tags: backend, infra
  Unblocks: 2 task(s)
  Candidates: 7
```

On an empty queue (everything claimed, blocked, or no tasks at all), `tasks pick` prints `No eligible tasks found (all claimed, blocked, or empty queue).` and exits 0 — so use stdout content (or `tasks list --unclaimed --unblocked` returning zero lines) to detect emptiness in a script, not the exit code.

`--tags` is a soft preference: if no candidate matches the requested tags, `pick` falls back to the full candidate set rather than returning empty. To get a hard tag filter, use `tasks list --tag <tag>` and act only when the output is non-empty.

## Enumerate Tasks Programmatically

```bash
tasks list                                 # every task, P0 first
tasks list --priority P0                   # only P0 tasks
tasks list --tag backend                   # only backend-tagged tasks
tasks list --unclaimed --unblocked         # only pickable work
tasks list --priority P0 --json            # structured output for scripting
```

`tasks list` is the read-only enumerator paired with `tasks pick`. Default output is one tab-separated line per task — `<priority>\t<id>\t<summary>` (or `-` if the task has no ID). `--json` returns the same structured fields the MCP `list_tasks` tool exposes (`id`, `summary`, `priority`, `tags`, `blocked`, `claimed`, `file`, `line`), so a script that runs against the CLI works the same against the MCP server. Both backends share `loadAllTasks` + the same `priority`/`tag`/`unclaimed`/`unblocked` predicates from `packages/cli/src/lib.ts`, so they cannot drift.

## What Changed?

```bash
tasks diff              # changes since last commit
tasks diff HEAD~5       # changes over last 5 commits
tasks diff main         # changes since branching from main
```

```
📋 Queue Changes (since HEAD)

  ✅ Removed (2):
    Fix authentication crash on token refresh
    Add input validation to /users endpoint

  ➕ Added (3):
    Migrate to new payment provider
    Add dark mode toggle
    Update API documentation

  🔒 Claimed (1):
    Migrate to new payment provider (@cursor)

  Summary: +3 added, -2 removed, 1 claimed
```

## When to Use

| Situation | Command |
|-----------|---------|
| Morning standup — what's the queue look like? | `tasks stats` |
| After a work session — what did the agent accomplish? | `tasks diff` |
| Sprint review — throughput over the last week | `tasks stats` |
| PR review — what tasks does this branch address? | `tasks diff main` |
| Debugging — is an agent actually completing work? | `tasks stats` (check top agents) |

## How Throughput Works

Throughput is measured from **git history** — every time a `- [ ]` line is removed in a commit to a TASKS.md file, that counts as one completed task. This means:

- Throughput tracks real completions, not just checkbox toggles
- History survives even though completed tasks are deleted from the file
- `git log` is the source of truth for what was done and when

## How Stats Are Computed

| Metric | Source |
|--------|--------|
| Priority breakdown | Parses all TASKS.md files via `@tasks-md/parser` |
| Blocked count | Cross-references `Blocked by` fields against all task IDs |
| Claimed count | Detects `(@agent-name)` patterns on task lines |
| Available | Total − blocked − claimed |
| Throughput | `git log -p` counting removed `- [ ]` lines |
| Top agents | Extracted from `(@agent)` in removed task lines |

## Files Involved

| File | Purpose |
|------|---------|
| [`packages/cli/src/lib.ts`](../../packages/cli/src/lib.ts) | `getQueueStats()`, `getQueueDiff()`, and `listTasks()` implementations (MCP parity) |
| [`packages/cli/src/cli.ts`](../../packages/cli/src/cli.ts) | `tasks stats`, `tasks diff`, and `tasks list` commands |
| [`packages/mcp/src/tools.ts`](../../packages/mcp/src/tools.ts) | `listTasksFromFiles()` — the same filter contract exposed via MCP |
| [`packages/parser/`](../../packages/parser/) | Shared parser for task file analysis |
