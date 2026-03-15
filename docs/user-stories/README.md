# User Stories

How people use TASKS.md — one doc per workflow.

TASKS.md is a spec, not a product. The user stories below cover both **spec users** (developers adding TASKS.md to their repos) and **tooling users** (people using the CLI, linter, and sync scripts shipped with this repo).

| # | Story | How |
|---|-------|-----|
| 1 | [Agents know what to work on](01-create-task-queue.md) | `tasks init` scaffolds TASKS.md + AGENTS.md |
| 2 | [Tasks agents complete without asking](02-write-good-tasks.md) | One-liners vs. rich metadata |
| 3 | [Agents work through the queue autonomously](03-install-next-task.md) | `tasks install` auto-detects agents |
| 5 | [Agents work in the right order](05-blockers.md) | IDs, `Blocked by`, unblocking impact |
| 6 | [Each team member has their own queue](06-multi-file.md) | Monorepo with multiple TASKS.md files |
| 9 | [Invalid task files never reach main](09-lint-in-ci.md) | `tasks-lint` validates format on every push |
| 10 | [Issue tracker decisions flow to agents](10-sync-issues.md) | `sync-issues.sh`, `sync-jira.sh`, `sync-linear.sh` |
| 12 | [See what TASKS.md looks like for my stack](12-add-example.md) | Realistic examples per ecosystem |

## Automation Status

All originally-identified automation gaps have been implemented:

| Feature | Story | Status |
|---------|-------|--------|
| `tasks init` scaffolding | [01](01-create-task-queue.md) | ✅ `scripts/tasks init` |
| `tasks install` auto-detect | [03](03-install-next-task.md) | ✅ `scripts/tasks install` |
| Write-once commands (canonical + generate) | [03](03-install-next-task.md) | ✅ `scripts/generate-commands.sh` + CI drift check |
| Deterministic `pick_task` MCP tool | — | ✅ `mcp/src/operations.ts` |
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
