# tasks-mcp

An MCP server for reading and writing TASKS.md files. Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.

## Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List all tasks with filtering by priority, tag, claim status, and blocker status |
| `claim_task` | Claim a task by appending `(@agent-name)` to the task line |
| `complete_task` | Remove a completed task block from the file |
| `add_task` | Add a new task under the specified priority heading |

## Setup

### Claude Code

```json
{
  "mcpServers": {
    "tasks": {
      "command": "node",
      "args": ["/path/to/tasks.md/mcp/dist/index.js"],
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
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TASKS_MCP_DIR` | `process.cwd()` | Working directory for TASKS.md discovery |

## How it works

The server discovers all `TASKS.md` files from the git root down using `fd`. It parses each file into structured task data including priority, metadata (ID, tags, details, files, acceptance, blocked-by), claim status, and line numbers.

- **`list_tasks`** returns all tasks sorted by priority with optional filters
- **`claim_task`** matches by ID or summary substring and appends `(@agent-name)`
- **`complete_task`** matches by ID or summary substring and removes the entire task block
- **`add_task`** inserts under the correct priority heading, creating the section if needed
