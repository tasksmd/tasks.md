# tasks-mcp

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
| `pick_task` | Deterministically select the best task to work on next (priority walk, blocker resolution, unblocking impact) |
| `claim_task` | Claim a task by appending `(@agent-name)` to the task line |
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
cd mcp
npm install
npm run build
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TASKS_MCP_DIR` | `process.cwd()` | Working directory for TASKS.md discovery |

## How it works

The server discovers all `TASKS.md` files from the git root down using `fd`. It parses each file into structured task data including priority, metadata (ID, tags, details, files, acceptance, blocked-by), claim status, and line numbers.

- **`list_tasks`** returns all tasks sorted by priority with optional filters
- **`pick_task`** walks P0→P3, skips blocked/claimed tasks, scores by unblocking impact, and returns the single best task
- **`claim_task`** matches by ID or summary substring and appends `(@agent-name)`
- **`complete_task`** matches by ID or summary substring and removes the entire task block
- **`add_task`** inserts under the correct priority heading, creating the section if needed

## License

[MIT](../LICENSE)
