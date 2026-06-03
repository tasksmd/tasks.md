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
| **One-prompt setup** — paste one prompt; the agent runs `commands/setup.md` (init + AGENTS.md merge + self-install + verify) | ✅ Shipped | [`commands/setup.md`](commands/setup.md), [user story 10](docs/user-stories/10-one-prompt-setup.md) |
| **Plan-first workflow** — agents write `docs/plans/<task-id>.md` before non-trivial work, validated by a reviewer subagent | ✅ Stable | [`docs/plans/next-task-plan-first-workflow.md`](docs/plans/next-task-plan-first-workflow.md), [`docs/templates/plan-template.md`](docs/templates/plan-template.md) |
| **Git-native fleet coordination (G7)** — collision-free claims + leases/heartbeats + path-scoped enforcement + blocked-by, proven by the 12-property conformance suite | ✅ Shipped | [`docs/plans/deterministic-fleet-claiming.md`](docs/plans/deterministic-fleet-claiming.md), [`packages/conformance/`](packages/conformance/), [`VISION.md` G7](VISION.md) |
| **Workspace mode** — `next-task` aggregates TASKS.md across nested repos in one or more workspaces, backend-aware | ✅ Shipped | [`spec.md` § Workspaces](spec.md#workspaces), [`packages/parser/src/workspace.ts`](packages/parser/src/workspace.ts) |
| **Dogfood git-native (G8)** — canonical repo converted to git-native (`TASKS.md` is now a generated snapshot) + one-shot `/migrate` command shipped | ✅ Shipped | [`.tasksmd.json`](.tasksmd.json), [`commands/migrate.md`](commands/migrate.md), [`VISION.md` G8](VISION.md) |
| **Site / docs hub** — public website at tasksmd.github.io | ✅ Live | [tasksmd.github.io/tasks.md](https://tasksmd.github.io/tasks.md/) |

## Active focus

The git-native fleet backend (G7) and workspace mode are **shipped**: collision-free CAS claims, leases + heartbeats + steal + crash-recovery fencing, log compaction, the path-scoped claim gate, and backend-aware multi-repo aggregation, all proven by the 11-property `@tasks-md/conformance` suite. The current operating mode is **dogfooding** (VISION.md G8): converting the canonical repo to git-native and shipping the one-shot consumer migration path. The portable spec layer stays the product (G1/G6); the coordination is delegated to a **backend** (G5). New work is curated tech-lead-style (see the policy comment at the top of [`TASKS.md`](TASKS.md)) and stays scoped to the `tasks.md` repo.

The active capability track:
1. **Dogfood git-native (G8)** — convert this repo's own queue to the git-native backend (`tasks migrate` + `tasks fleet init`) so `TASKS.md` becomes a generated snapshot and claims go through the `tasks-claims` ref. Removes file-backend-only assumptions from the repo's own docs/CI. ([details in TASKS.md](TASKS.md))
2. **Consumer migration command** — a one-shot, in-repo `/migrate` command (canonical source → per-agent variants, like `/next-task`) that walks any existing file-backend repo through the flip and verifies it. The same path that converts this repo. ([details in TASKS.md](TASKS.md))
3. **Per-package release automation** — Trusted Publishing (OIDC) is wired up via `.github/workflows/`; per-package release notes generation is next (blocked on npm maintainer auth — see [`TASKS.md`](TASKS.md)).

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
