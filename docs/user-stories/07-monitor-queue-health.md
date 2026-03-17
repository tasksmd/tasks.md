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

## JSON Output for Scripting

Both commands support `--json` for structured output:

```bash
tasks stats --json          # machine-readable queue stats
tasks diff --json           # machine-readable queue changes
tasks pick --json           # machine-readable task selection
```

Pipe into `jq`, feed to dashboards, or use in CI scripts:

```bash
tasks stats --json | jq '.available'          # how many tasks are ready
tasks diff --json | jq '.removed | length'    # how many completed since last commit
```

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
| [`packages/cli/src/lib.ts`](../../packages/cli/src/lib.ts) | `getQueueStats()` and `getQueueDiff()` implementation |
| [`packages/cli/src/cli.ts`](../../packages/cli/src/cli.ts) | `tasks stats` and `tasks diff` commands |
| [`packages/parser/`](../../packages/parser/) | Shared parser for task file analysis |
