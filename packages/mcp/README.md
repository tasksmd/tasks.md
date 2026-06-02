# tasks-mcp

[![npm](https://img.shields.io/npm/v/tasks-mcp)](https://www.npmjs.com/package/tasks-mcp)

MCP server for [TASKS.md](https://github.com/tasksmd/tasks.md) — exposes the queue to Claude Code, Cursor, Windsurf, and any MCP-compatible client.

## Install

```bash
npm install -g tasks-mcp
```

Or run directly with npx:

```bash
npx -y tasks-mcp
```

## Use

Add the server to your MCP client config. Example for Claude Code:

```json
{
  "mcpServers": {
    "tasks": {
      "command": "npx",
      "args": ["tasks-mcp"],
      "env": { "TASKS_MCP_DIR": "/path/to/your/repo" }
    }
  }
}
```

The server discovers every `TASKS.md` from the git root down and parses each file via [`@tasks-md/parser`](../parser/), so its filter and pick behavior matches `@tasks-md/cli` exactly.

**Backend-mediated mutations.** On the default `tasks-md` backend the tools edit `TASKS.md` directly. When the repo declares a non-file backend in `.tasksmd.json` (`github-issues` or `git-native`; see [`spec.md` § Task backends](../../spec.md#task-backends)), the mutation tools (`add_task`, `claim_task`, `unclaim_task`, `complete_task`, `pick_task`) delegate to the `tasks` CLI so every backend goes through one collision-free implementation rather than the MCP duplicating file-only semantics.

To build from source:

```bash
cd packages/mcp
npm install
npm run build
npm start
```

## API

| Tool | What it does |
|------|--------------|
| `list_tasks` | List tasks with optional `priority`, `tag`, `unclaimedOnly`, `unblockedOnly` filters. Same predicates as `tasks list` |
| `pick_task` | Walks P0→P3, skips blocked / claimed / `standing-loop`, scores by unblocking impact. Pass `task_id` to target an exact `**ID**` (returns `missing` / `duplicate` / `already_claimed` / `blocked` / `ready` / `resumed` / `claimed`); pass `agent_name` to claim or resume |
| `claim_task` | Append `(@agent-name)` to a task line. Exact `**ID**` match wins; falls back to summary substring |
| `unclaim_task` | Remove a `(@agent-name)` claim for stale-claim recovery. Same ID-then-summary lookup as `claim_task` |
| `complete_task` | Remove a completed task block from the file. Same lookup as `claim_task` |
| `add_task` | Insert a new task under the given priority heading; creates the section if it doesn't exist |
| `enrich_task` | Append research notes to a blocked task and stamp `**Last-enriched**`. Never modifies `**Blocked**` / `**Blocked by**` |

| Variable | Default | Purpose |
|----------|---------|---------|
| `TASKS_MCP_DIR` | `process.cwd()` | Working directory for TASKS.md discovery |

For mutation tools (`claim_task`, `unclaim_task`, `complete_task`, `enrich_task`), exact `**ID**` matching wins even when an earlier task summary contains the same query. Use `pick_task` with `task_id` when you need ID-only behavior that reports `missing`, `duplicate`, `blocked`, or `claimed` instead of falling back to summaries.

## See also

- [Specification](../../spec.md) — the canonical TASKS.md format
- [Root README](../../README.md) — project overview and quick start
- [`@tasks-md/cli`](../cli/) — CLI with the same operations as the MCP tools
- [`@tasks-md/lint`](../lint/) — TASKS.md linter
- [`@tasks-md/parser`](../parser/) — shared parser the server calls

## License

[MIT](../../LICENSE)
