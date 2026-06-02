# User Stories

How people use TASKS.md — one doc per workflow.

TASKS.md is a spec, not a product. The user stories below cover both **spec users** (developers adding TASKS.md to their repos) and **tooling users** (people using the CLI, linter, and sync scripts shipped with this repo).

| # | Story | How |
|---|-------|-----|
| 1 | [Agents know what to work on](01-agents-know-what-to-work-on.md) | `tasks init` scaffolds TASKS.md + AGENTS.md |
| 2 | [Tasks agents complete without asking](02-tasks-agents-complete-without-asking.md) | One-liners vs. rich metadata |
| 3 | [Agents work through the queue autonomously](03-agents-work-through-queue.md) | [`tasks install`](03-agents-work-through-queue.md#auto-detect-algorithm) auto-detects 6 agents (Claude Code, Codex, Cursor, Devin, Gemini CLI, Windsurf) |
| 4 | [Agents work in the right order](04-agents-work-in-right-order.md) | IDs, `Blocked by`, unblocking impact |
| 5 | [Each team member has their own queue](05-separate-queues-per-member.md) | Monorepo with multiple TASKS.md files |
| 6 | [Issue tracker decisions flow to agents](06-issue-tracker-flows-to-agents.md) | `tasks sync github`, `tasks sync jira`, `tasks sync linear` |
| 7 | [Monitor queue health at a glance](07-monitor-queue-health.md) | `tasks stats`, `tasks diff`, `tasks list` |
| 8 | [Rich task metadata for blocked, multi-session, and decomposed work](08-rich-task-metadata.md) | `**Blocked**`, `**Research**`, `**Last-enriched**`, `**Parent**`, standing audit loops, file-level + section-level `<!-- policy: -->` comments |
| 9 | [Standing audit loops in practice](09-standing-audit-loops.md) | One TASKS.md task block + `**Tags**: standing-loop` — `pickBestTask` skips it during normal walks; `/next-task standing-audit-gap-loop` targets it on demand |

## Automation Status

All originally-identified automation gaps have been implemented:

| Feature | Story | Status |
|---------|-------|--------|
| `tasks init` scaffolding | [01](01-agents-know-what-to-work-on.md) | ✅ `tasks init` |
| `tasks install` auto-detect | [03](03-agents-work-through-queue.md) | ✅ `tasks install` |
| Write-once commands (canonical + generate) | [03](03-agents-work-through-queue.md) | ✅ `tasks generate-commands` + CI drift check |
| Devin `/next-task` skill | [03](03-agents-work-through-queue.md) | ✅ `commands/devin/skills/next-task/SKILL.md` |
| Deterministic `pick_task` | [07](07-monitor-queue-health.md) | ✅ `tasks pick` + `tasks-mcp` MCP tool |
| CLI ↔ MCP `list_tasks` parity | [07](07-monitor-queue-health.md#enumerate-tasks-programmatically) | ✅ `tasks list` (same filters as MCP) |
| Linter `--fix` mode | [01](01-agents-know-what-to-work-on.md#keeping-the-queue-valid) | ✅ `npx @tasks-md/lint --fix` (canonical lint surface) |
| GitHub Issues `--merge` mode | [06](06-issue-tracker-flows-to-agents.md) | ✅ `tasks sync github --merge` |
| Jira bridge | [06](06-issue-tracker-flows-to-agents.md#jira-sync) | ✅ `tasks sync jira` |
| Linear bridge | [06](06-issue-tracker-flows-to-agents.md#linear-sync) | ✅ `tasks sync linear` |
| `tasks watch` (auto-lint) | [01](01-agents-know-what-to-work-on.md#watch-mode) | ✅ `tasks watch` |
| Queue stats & diff | [07](07-monitor-queue-health.md) | ✅ `tasks stats` / `tasks diff` |
| Reusable CI workflow | [01](01-agents-know-what-to-work-on.md#add-to-ci) | ✅ `.github/workflows/tasks-lint.yml` |

## Backends and the human/agent contract

Every story above works the same way for the human: **humans read the queue and tell their agents what to work on; agents and tools mutate task state.** What changes between [backends](../../spec.md#task-backends) is *where* that state lives and what guarantees it carries:

| Backend | Capability | Task state | Claiming | When |
|---|---|---|---|---|
| **File** (`tasks-md`, default) | spec-compatible, offline-capable | `TASKS.md` is the source of truth — **human-editable** | best-effort `(@agent)` | solo, low-concurrency |
| **Git-native** | spec-compatible, **collision-free**, fleet-default | an append-only `tasks-claims` log; `TASKS.md` is a generated snapshot agents never hand-edit | collision-free via git ref compare-and-swap | a team of machines × per-host agent fleets (VISION.md G7) |
| **GitHub Issues** | spec-compatible, infra-required | open issues carrying the marker label | issue assignee | teams already living in a tracker |

"Collision-free" means no two agents ever hold the same task at once — **not** a globally reproducible race winner; only the *fold of the log* is reproducible. In the file backend, editing `TASKS.md` by hand stays the zero-setup path; in generated backends (git-native, Issues) task mutation is agent/tool-mediated, so a human commands an agent rather than hand-editing generated state.

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
