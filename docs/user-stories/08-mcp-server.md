# User Story: Use the MCP Server

> As an agent, I want to manage tasks programmatically — list, claim, complete, and add — without parsing Markdown myself.

## What It Is

`tasks-mcp` is an MCP server that wraps TASKS.md file operations into four tools. Any MCP-compatible agent (Claude Code, Cursor, Windsurf) can use it.

## Setup

### Build from source

```bash
cd mcp
npm install
npm run build
```

### Add to your MCP config

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

`TASKS_MCP_DIR` sets the working directory for file discovery. Defaults to `process.cwd()`.

## Tools

### `list_tasks`

List all tasks with optional filtering:

| Filter | What it does |
|--------|-------------|
| `priority` | Only tasks at this level (P0, P1, P2, P3) |
| `tag` | Only tasks with this tag |
| `unclaimed_only` | Skip tasks with `(@agent-name)` |
| `unblocked_only` | Skip tasks with unresolved blockers |

Returns structured data: priority, metadata (ID, tags, details, files, acceptance, blocked-by), claim status, and source file.

### `claim_task`

Claim a task by summary substring or ID:

```
claim_task(query="rate limiting", agent_name="cascade")
```

Appends `(@cascade)` to the matching task line in the file.

### `complete_task`

Remove a completed task block:

```
complete_task(query="rate limiting")
```

Removes the task line, all metadata, and any sub-tasks from the file.

### `add_task`

Add a new task:

```
add_task(
  summary="Add caching layer",
  priority="P2",
  tags="backend, performance",
  details="Use Redis for session and query cache",
  files="src/cache/redis.ts"
)
```

Inserts under the correct priority heading. Creates the section if it doesn't exist.

## How It Works

The server discovers all TASKS.md files from the git root using `fd`. It parses each file into structured task data — priority, metadata, claim status, and line numbers. Mutations write back to the source file directly.

## `pick_task` ✓

The `pick_task` tool applies the selection algorithm deterministically:

1. Walk P0 → P3
2. Skip blocked tasks (referenced IDs still exist)
3. Skip claimed tasks
4. Score by unblocking impact (count downstream dependents)
5. Filter by agent tags (optional)
6. Return the single best task

This gives MCP-equipped agents consistent, correct picks without relying on the LLM to interpret selection rules.

## When to Use MCP vs. /next-task

| Scenario | Use |
|----------|-----|
| Agent autonomously drains the queue | `/next-task` command |
| Agent needs to query tasks mid-session | `list_tasks` MCP tool |
| Orchestrator adds tasks programmatically | `add_task` MCP tool |
| Deterministic task selection | `pick_task` MCP tool |
| Stronger claiming guarantees | MCP server (atomic operations) |

They complement each other — `/next-task` is the autonomous loop, MCP is the programmatic API.

## Files Involved

| File | Purpose |
|------|---------|
| `mcp/src/index.ts` | Server entry, tool registration |
| `mcp/src/parser.ts` | TASKS.md file parser |
| `mcp/src/tools.ts` | Tool implementations (list, claim, complete, add) |
| [mcp/README.md](../../mcp/README.md) | Full documentation |
