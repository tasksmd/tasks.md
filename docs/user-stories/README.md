# User Stories

How agents and people use TASKS.md — one doc per workflow.

TASKS.md is a spec, not a product. The user stories below cover both **spec users** (developers adding TASKS.md to their repos) and **tooling users** (agents and people using the MCP server, linter, and CLI commands shipped with this repo). Most workflows assume an agent-driven or CLI-automated approach as the default.

| # | Story | Who | How |
|---|-------|-----|-----|
| 1 | [Create a task queue](01-create-task-queue.md) | CLI / Agent | `tasks init` scaffolds TASKS.md + AGENTS.md |
| 2 | [Write good tasks](02-write-good-tasks.md) | Agent / Human | One-liners vs. rich metadata |
| 3 | [Install /next-task](03-install-next-task.md) | CLI | `tasks install` auto-detects agents |
| 4 | [Run the autonomous loop](04-autonomous-loop.md) | Agent | `/next-task` → pick → claim → work → remove → loop |
| 5 | [Use blockers and dependencies](05-blockers.md) | Agent / Human | IDs, `Blocked by`, unblocking impact |
| 6 | [Multi-file setup](06-multi-file.md) | Agent / Human | Monorepo with multiple TASKS.md files |
| 7 | [Multi-agent coordination](07-multi-agent.md) | Agent | Claiming, stale claims, conflict resolution |
| 8 | [Use the MCP server](08-mcp-server.md) | Agent | `tasks-mcp` for programmatic task management |
| 9 | [Lint in CI](09-lint-in-ci.md) | CI / CLI | `tasks-lint` validates format on every push |
| 10 | [Sync from issue trackers](10-sync-issues.md) | CI / CLI | `sync-issues.sh`, `sync-jira.sh`, `sync-linear.sh` |
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
| sync-linear (Linear bridge) | [10](10-sync-issues.md#linear-sync) | ✅ `scripts/sync-linear.sh` |
| `tasks watch` (auto-lint) | — | ✅ `scripts/watch.sh` |
| Reusable CI workflow | [09](09-lint-in-ci.md#reusable-workflow) | ✅ `.github/workflows/tasks-lint.yml` |

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
