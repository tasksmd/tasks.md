# Roadmap

> Where tasks.md is and what's next. See [`VISION.md`](VISION.md) for the strategic frame and [`TASKS.md`](TASKS.md) for the active work queue.

This file is the root-level milestone summary that the `load-project-context` rule expects. Detailed work is tracked in [`TASKS.md`](TASKS.md); user-facing capabilities are documented in [`docs/user-stories/`](docs/user-stories/).

## Capability tracker

| Capability | Status | Captured by |
|---|---|---|
| **Spec v1** — canonical TASKS.md format | ✅ Stable | [`spec.md`](spec.md), [`examples/`](examples/) |
| **Parser** — typed tree from TASKS.md | ✅ Stable | [`@tasks-md/parser`](packages/parser/) |
| **Lint** — validates TASKS.md against spec | ✅ Stable | [`@tasks-md/lint`](packages/lint/) + `tasks-lint` bin |
| **MCP server** — TASKS.md ops as MCP tools | ✅ Stable | [`tasks-mcp`](packages/mcp/) |
| **CLI** — `tasks` binary (list / search / claim / complete) | ✅ Stable | [`@tasks-md/cli`](packages/cli/) |
| **Cross-agent command generation** — single source of truth for `/next-task` + `/lint-tasks` | ✅ Stable | [`commands/`](commands/) + `tasks generate-commands` + `commands-drift` CI |
| **Per-agent variants** — Claude Code, Codex, Cursor, Devin, Gemini CLI, Windsurf | ✅ Shipped | [`commands/{claude,codex,cursor,devin,gemini,windsurf}/`](commands/) |
| **Plan-first workflow** — agents write `docs/plans/<task-id>.md` before non-trivial work, validated by a reviewer subagent | ✅ Stable | [`docs/plans/next-task-plan-first-workflow.md`](docs/plans/next-task-plan-first-workflow.md), [`docs/templates/plan-template.md`](docs/templates/plan-template.md) |
| **Workspace mode** — `next-task` aggregates TASKS.md files across nested repos in one or more workspaces | 🟡 In progress | [`TASKS.md` § "Workspace mode"](TASKS.md) |
| **Site / docs hub** — public website at tasksmd.github.io | ✅ Live | [tasksmd.github.io/tasks.md](https://tasksmd.github.io/tasks.md/) |

## Active focus

The current operating mode is **spec hardening and user-story coverage.** New work is curated tech-lead-style (see policy comment at the top of [`TASKS.md`](TASKS.md)) and stays scoped to: (a) sharpening user-story acceptance criteria, (b) simplifying CLI features that overlap, (c) avoiding scope creep beyond the `tasks.md` repo.

The next two capabilities on the queue:
1. **Workspace mode** — multi-repo, multi-workspace aggregation. Parser, CLI, MCP, and `/next-task` all learn to traverse nested repos under one or more workspace roots. ([details in TASKS.md](TASKS.md))
2. **Per-package release automation** — Trusted Publishing (OIDC) is wired up via `.github/workflows/`; per-package release notes generation is next.

## Adoption signals

Adoption is the only metric that matters. Today the spec lands in `~/apps/tooling/agentbrew`, `~/apps/tooling/minsky`, `~/apps/tooling/dotfiles`, the three `~/apps/oncall-hub/oncall-hub-*` repos, and any repo any of those agents touch. The npm packages have weekly download counts on the badges in [`README.md`](README.md).

When a new agent vendor ships first-class `/next-task` support, that's a milestone-worthy event — file it under "agent integrations" in [`docs/user-stories/`](docs/user-stories/) and link the upstream PR.

## Where work happens

| Surface | Authoritative file | Cadence |
|---|---|---|
| Open tasks | [`TASKS.md`](TASKS.md) (P0–P3) | Continuous |
| Plans for non-trivial tasks | [`docs/plans/<task-id>.md`](docs/plans/) | Per-task |
| User stories | [`docs/user-stories/`](docs/user-stories/) (numbered) | New US per shipped capability |
| Spec definition | [`spec.md`](spec.md) | Conservative; breaking changes are spec-version bumps |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) + [`AGENTS.md`](AGENTS.md) | Updated in same commit as behavior changes |

## Out-of-scope (won't do)

Per [`VISION.md` § "Non-goals"](VISION.md#non-goals):
- A GUI / project-management tool
- A workflow engine / routing layer
- A graph database for blocked-by edges
- Per-vendor format extensions (every TASKS.md works for every agent)
