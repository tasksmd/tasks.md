# User Stories

How people and agents use TASKS.md — one doc per workflow.

TASKS.md is a spec, not a product. The user stories below cover both **spec users** (developers adding TASKS.md to their repos) and **tooling users** (people using the MCP server, linter, and agent commands shipped with this repo).

| # | Story | Who | How |
|---|-------|-----|-----|
| 1 | [Create a task queue](01-create-task-queue.md) | Human | Create `TASKS.md`, add tasks under P0–P3 |
| 2 | [Write good tasks](02-write-good-tasks.md) | Human | One-liners vs. rich metadata |
| 3 | [Install /next-task](03-install-next-task.md) | Human (once) | Copy command file into project |
| 4 | [Run the autonomous loop](04-autonomous-loop.md) | Agent | `/next-task` → pick → claim → work → remove → loop |
| 5 | [Use blockers and dependencies](05-blockers.md) | Human / Agent | IDs, `Blocked by`, unblocking impact |
| 6 | [Multi-file setup](06-multi-file.md) | Human | Monorepo with multiple TASKS.md files |
| 7 | [Multi-agent coordination](07-multi-agent.md) | Agent | Claiming, stale claims, conflict resolution |
| 8 | [Use the MCP server](08-mcp-server.md) | Agent | `tasks-mcp` for programmatic task management |
| 9 | [Lint in CI](09-lint-in-ci.md) | CI | `tasks-lint` validates format on every push |
| 10 | [Sync from GitHub Issues](10-sync-issues.md) | Human / CI | `sync-issues.sh` imports labeled issues |
| 11 | [Integrate with an orchestrator](11-orchestrator.md) | Orchestrator | Tag-based routing, planner/executor pattern |
| 12 | [Add an example](12-add-example.md) | Contributor | Add a new stack example to `examples/` |

## Automation Status

All originally-identified automation gaps have been implemented:

| Feature | Story | Status |
|---------|-------|--------|
| `tasks init` scaffolding | [01](01-create-task-queue.md) | ✅ `scripts/tasks init` |
| `tasks install` auto-detect | [03](03-install-next-task.md) | ✅ `scripts/tasks install` |
| Write-once commands (canonical + generate) | [03](03-install-next-task.md) | ✅ `scripts/generate-commands.sh` + CI drift check |
| Deterministic `pick_task` MCP tool | [08](08-mcp-server.md) | ✅ `mcp/src/operations.ts` |
| Linter `--fix` mode | [09](09-lint-in-ci.md) | ✅ `node lint/index.js --fix` |
| sync-issues `--merge` mode | [10](10-sync-issues.md) | ✅ `scripts/sync-issues.sh --merge` |
| sync-jira (Jira bridge) | [10](10-sync-issues.md#jira-sync) | ✅ `scripts/sync-jira.sh` |

## Design Philosophy

- **Zero setup** — create a file and start writing
- **Agent-native** — LLMs parse Markdown natively, no API client needed
- **Vendor-neutral** — works with any agent, any IDE, any CI system
- **Git-native** — version-controlled, next to the code
- **Scales up** — one file for small repos, directory-scoped files for monorepos

## Relationship to Other Standards

| Standard | Role |
|----------|------|
| [AGENTS.md](https://agents.md/) | Tells agents **how** to work |
| [TASKS.md](https://github.com/tasksmd/tasks.md) | Tells agents **what** to work on |
| [MCP](https://modelcontextprotocol.io/) | `tasks-mcp` provides programmatic access |
