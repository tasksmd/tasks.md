# tasks-mcp

[![npm](https://img.shields.io/npm/v/tasks-mcp)](https://www.npmjs.com/package/tasks-mcp)

An MCP server for reading and writing [TASKS.md](https://github.com/tasksmd/tasks.md) files. Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.

## Install

```bash
npm install -g tasks-mcp
```

Or run directly with npx:

```bash
npx tasks-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List all tasks with filtering by priority, tag, claim status, and blocker status |
| `pick_task` | Deterministically select the best task to work on next, or pass `task_id` to target an exact `**ID**` |
| `claim_task` | Claim a task by appending `(@agent-name)` to the task line |
| `unclaim_task` | Remove a claim from a task for stale claim recovery when an agent crashed or its session ended |
| `complete_task` | Remove a completed task block from the file |
| `add_task` | Add a new task under the specified priority heading |

## Setup

### Claude Code

```json
{
  "mcpServers": {
    "tasks": {
      "command": "npx",
      "args": ["tasks-mcp"],
      "env": {
        "TASKS_MCP_DIR": "/path/to/your/repo"
      }
    }
  }
}
```

### Build from source

```bash
cd packages/mcp
npm install
npm run build
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TASKS_MCP_DIR` | `process.cwd()` | Working directory for TASKS.md discovery |

## How it works

The server discovers all `TASKS.md` files from the git root down. It parses each file into structured task data including priority, metadata (ID, tags, details, files, acceptance, blocked-by), claim status, and line numbers.

- **`list_tasks`** returns all tasks sorted by priority with optional filters
- **`pick_task`** walks P0→P3, skips blocked, claimed, and `standing-loop` tasks, scores by unblocking impact, and returns the single best task
- **`pick_task` with `task_id`** bypasses queue order and targets one exact `**ID**`. It returns structured `status` values for `missing`, `duplicate`, `already_claimed`, `blocked`, `ready`, `resumed`, and `claimed`; pass `agent_name` to claim an actionable target or resume a target already claimed by that same agent. This is the MCP equivalent of `/next-task <task-id>`, including standing loops such as `standing-audit-gap-loop` (which auto-pick skips by design).
- **`claim_task`** matches by ID or summary substring and appends `(@agent-name)`
- **`unclaim_task`** matches by ID or summary substring and removes the `(@agent-name)` claim
- **`complete_task`** matches by ID or summary substring and removes the entire task block
- **`add_task`** inserts under the correct priority heading, creating the section if needed

## License

[MIT](../LICENSE)
