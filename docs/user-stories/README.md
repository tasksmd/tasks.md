# User Stories

How people use TASKS.md — one doc per workflow.

TASKS.md is a spec, not a product. The user stories below cover both **spec users** (developers adding TASKS.md to their repos) and **tooling users** (people using the CLI, linter, and sync scripts shipped with this repo).

| # | Story | How |
|---|-------|-----|
| 1 | [Agents know what to work on](01-agents-know-what-to-work-on.md) | `tasks init` scaffolds TASKS.md + AGENTS.md |
| 2 | [Tasks agents complete without asking](02-tasks-agents-complete-without-asking.md) | One-liners vs. rich metadata |
| 3 | [Agents work through the queue autonomously](03-agents-work-through-queue.md) | `tasks install` auto-detects agents |
| 4 | [Agents work in the right order](04-agents-work-in-right-order.md) | IDs, `Blocked by`, unblocking impact |
| 5 | [Each team member has their own queue](05-separate-queues-per-member.md) | Monorepo with multiple TASKS.md files |
| 6 | [Issue tracker decisions flow to agents](06-issue-tracker-flows-to-agents.md) | `sync-issues.sh`, `sync-jira.sh`, `sync-linear.sh` |

## Automation Status

All originally-identified automation gaps have been implemented:

| Feature | Story | Status |
|---------|-------|--------|
| `tasks init` scaffolding | [01](01-agents-know-what-to-work-on.md) | ✅ `scripts/tasks init` |
| `tasks install` auto-detect | [03](03-agents-work-through-queue.md) | ✅ `scripts/tasks install` |
| Write-once commands (canonical + generate) | [03](03-agents-work-through-queue.md) | ✅ `scripts/generate-commands.sh` + CI drift check |
| Deterministic `pick_task` MCP tool | — | ✅ `mcp/src/operations.ts` |
| Linter `--fix` mode | [01](01-agents-know-what-to-work-on.md#keeping-the-queue-valid) | ✅ `node lint/index.js --fix` |
| sync-issues `--merge` mode | [06](06-issue-tracker-flows-to-agents.md) | ✅ `scripts/sync-issues.sh --merge` |
| sync-jira (Jira bridge) | [06](06-issue-tracker-flows-to-agents.md#jira-sync) | ✅ `scripts/sync-jira.sh` |
| sync-linear (Linear bridge) | [06](06-issue-tracker-flows-to-agents.md#linear-sync) | ✅ `scripts/sync-linear.sh` |
| `tasks watch` (auto-lint) | [01](01-agents-know-what-to-work-on.md#watch-mode) | ✅ `scripts/watch.sh` |
| Reusable CI workflow | [01](01-agents-know-what-to-work-on.md#add-to-ci) | ✅ `.github/workflows/tasks-lint.yml` |

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
