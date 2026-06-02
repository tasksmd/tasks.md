---
schema: vision-v1
version: 3
last_reviewed: 2026-06-02
goals:
  - id: G1
    name: Spec first, packages second
    description: spec.md is canonical; the parser, lint, MCP, and CLI packages are reference implementations that exist only to validate the spec and bootstrap adoption. A behaviour change starts in spec.md and propagates to every package and command in the same commit. The format is the product (G6).
  - id: G2
    name: Cross-agent commands are generated, not hand-edited
    description: commands/next-task.md and commands/lint-tasks.md are the canonical sources; per-agent variants regenerate from them and CI rejects manual edits to a generated variant. One workflow, every agent — which is what makes G4 (no lock-in) real at the command layer.
  - id: G3
    name: One TASKS.md per repo, optionally federated
    description: A repo's queue is one file at its root, the source of truth. Workspace-mode aggregates per-host and cross-repo queues for picking, but never replaces the per-repo file.
  - id: G4
    name: No vendor lock-in
    description: Every agent and every backend works against the same spec. Switching agents, or switching the coordination backend (G5), is configuration — never migration. The portable layer is the spec, never the storage.
  - id: G5
    name: File-first, pluggable backends
    description: A local markdown TASKS.md is the default, zero-infra backend and the reference implementation. The same spec / parser / CLI / MCP surface MAY target another backend — GitHub Issues, an atomic queue, a git-native queue, or an MCP broker — as an explicit opt-in. Backends are adapters behind one surface; this is the mechanism by which coordination is delegated (G6) and the fleet is served (G7).
  - id: G6
    name: Thinnest layer that solves the goal
    description: tasks.md owns ONLY the portable semantic layer — the format, priority, tags, blocked-by, removable-not-toggleable completion, and the /next-task workflow. Everything the ecosystem already solves — atomic dequeue, locking, leases, scheduling, merge serialization — is delegated to a backend (G5), never reimplemented. The default is GET (adopt an existing tool) over BUILD; bespoke distributed-systems code must first prove no backend is adaptable. This principle is the reason G1 and G5 hold.
  - id: G7
    name: Fleet coordination is the primary use case
    description: The flagship reason to adopt tasks.md is to run a TEAM of machines — each running a PARALLEL fleet of agents — against one queue with zero duplicate work and deterministic selection. tasks.md supplies the agent-readable layer and delegates the collision-free, two-tier coordination to a backend (G5/G6) — git-native by default, because agents are file-native (see Core beliefs); a server-backed queue is offered only where that infra already exists. The solo case (one agent, one file) is the zero-setup default; the fleet case is what the design must never break.
non_goals:
  - id: NG1
    name: Not a project management tool
    description: No GUI, no time tracking, no assignment model beyond the (@agent) claim suffix. For Jira/Linear semantics, integrate with those tools or use the Issues backend (G5) — don't reinvent them.
  - id: NG2
    name: Not a workflow engine or scheduler
    description: TASKS.md describes what work exists, not how it is routed or executed. Fleet coordination (G7) is delegated to a backend (G6) — tasks.md never ships its own scheduler, lock service, or router.
  - id: NG3
    name: Not a graph database
    description: blocked-by edges are a flat list of IDs, not a topological engine. Agents pick tasks; humans curate priority.
---

# Vision

> **A lightweight, machine-readable spec for AI-agent task queues** — the "what to work on" companion to [AGENTS.md](https://agents.md/)'s "how to work."

## The one job

An AI coding agent that starts a session asks one question: *"What should I work on?"* `tasks.md` is the open standard that answers it — a `TASKS.md` file at the repo root that any agent (Claude Code, Cursor, Windsurf, Devin, Codex, Gemini CLI, OpenHands, and 30+ others) reads, claims from, and updates through one shared format. AGENTS.md tells an agent *how* to work in a repo; TASKS.md tells it *what* to work on.

Today's options all fail at that one job:

- **Issues / Jira as the only queue** — too heavy for sub-PR work, no priority or claim semantics, network-bound. (Teams already living there opt into an Issues *backend* — G5 — and keep the same surface.)
- **Plain markdown checklists** — no parser, no lint, no claims, no metadata.
- **Per-tool todo formats** — fragment by agent; a task written for one agent can't be picked up by another.

## Primary use case: the fleet

The most demanding — and most valuable — scenario is a **fleet**: a *team of machines* working one queue at the same time, each machine running a *parallel fleet of agents*. The hard requirement is that **no two agents anywhere pick the same task**, and that selection is **deterministic** and reproducible. This two-tier shape — a team of hosts × per-host agents — is the use case the design is built around (G7).

The simplest scenario — one developer, one agent, one file — is the **zero-setup default**. The fleet is what the design must never break; the solo case is what it must never burden.

## The governing principle: thinnest layer that solves the goal

tasks.md does **not** solve the fleet by building a coordinator. Collision-free work distribution across many machines and workers is a decades-solved problem — it is, in the end, a job queue. So tasks.md owns only the part the ecosystem *hasn't* standardised — the portable, agent-readable task layer — and **delegates** the rest (G6).

| tasks.md owns (the spec) | Delegated to a backend (G5) |
|---|---|
| The markdown format, priority (P0–P3), tags, **blocked-by**, claims | Atomic dequeue / mutual exclusion |
| Removable-not-toggleable completion (history in git log) | Leases, crash recovery, fencing tokens |
| The cross-agent `/next-task` + `/lint-tasks` workflow | Scheduling, routing, merge serialization |
| The parser, linter, and the spec that ties them together | Multi-machine transport |

This is why **"spec first" (G1) and "fleet-primary" (G7) are the same idea, not competing ones**: the spec stays tiny *because* the hard machinery is borrowed.

## Backends: one surface, several engines

The coordination engine is pluggable, and every backend exposes the identical spec / parser / CLI / MCP surface — so switching is configuration, not migration (G4, G5). Because agents are file-native (see Core beliefs), the **git-native** path is the default for fleets; the others exist for teams whose infra or habits point elsewhere:

| Backend | What it is | When |
|---|---|---|
| **File** (default) | git-synced `TASKS.md`, best-effort `(@agent)` claim | solo, low-concurrency, offline |
| **Git-native** (default for fleets) | per-task claim files + git-push CAS + TTL lease (the tq + Nautilus git-queue model) | a team of machines × per-host agent fleets, no server — the primary use case (G7) |
| **Atomic queue** | pgmq / River on Postgres `SKIP LOCKED` (visibility-timeout = lease) | only where that infra already exists |
| **MCP broker** | one `tasks-mcp` (HTTP) serializing pick / claim | agents already speak MCP; a single coordination point |
| **Issues** | GitHub Issues / Projects (assignee, labels, `Closes #N`) | teams already living in a tracker |

The format, tags, priority order, blocked-by graph, and `/next-task` commands are identical across all of them. **The spec is portable; the coordination is borrowed.** The default decision is *adopt*; building a bespoke coordinator is the last resort, gated on no backend being adaptable (G6).

## Strategy: spec first, packages second

1. **Spec is canonical.** [`spec.md`](spec.md) defines the format; [`examples/`](examples/) are normative fixtures. A change in `spec.md` propagates to parser, lint, MCP, CLI, and every `/next-task` variant in the same commit.
2. **Reference packages stay small.** `parser`, `lint`, `mcp`, and `cli` each do one thing; none gains a feature that doesn't serve the spec (G6).
3. **Commands are generated.** [`commands/next-task.md`](commands/next-task.md) and [`commands/lint-tasks.md`](commands/lint-tasks.md) are canonical; per-agent variants under `commands/{claude,codex,cursor,devin,gemini,windsurf}/` regenerate, and CI rejects hand-edits (G2).

## Where this fits in the agent ecosystem

| Spec | Tells agents… | Maintained by |
|---|---|---|
| [AGENTS.md](https://agents.md/) | *how* to work in this repo (conventions, tests, build) | the agents.md community |
| **TASKS.md (this spec)** | *what* to work on (queue, priority, claims) | tasksmd contributors |
| [Devin instructions](https://devin.ai/docs) / Claude `CLAUDE.md` / Cursor rules | per-agent customization on top of AGENTS.md | each agent vendor |

The three layers compose: AGENTS.md sets repo conventions, TASKS.md lists the work, and agent-specific files refine behaviour.

## Non-goals

Each of these falls straight out of G6 — it is something the ecosystem already does better:

- **Not a project management tool** (NG1). No GUI, no time tracking, no assignment model beyond `(@agent)`. Integrate Jira/Linear, or use the Issues backend.
- **Not a workflow engine or scheduler** (NG2). TASKS.md says what work exists, not how it is routed. Fleet coordination is *delegated*, never built here.
- **Not a graph database** (NG3). blocked-by is a flat list of IDs, not a topological engine.

## Core beliefs

- **Thinnest layer that solves the goal** (G6). Own the format and the workflow; delegate everything the ecosystem already provides. GET before BUILD.
- **Agents are file-native.** Agents read, write, grep, and diff files and run git as a matter of course — so coordination that lives in files + git is coordination an agent can actually see and reason about. This is why the fleet path is git-native by default (per-task claim files + git-push compare-and-swap), and why a server-backed queue, however capable, is offered only where that infra already exists: it sits outside the agent's native surface.
- **Tickets are agent prompts.** ([source](https://dheer.co/tickets-are-prompts/)) A task describes the outcome a human wants, not the implementation; the agent decomposes. This shapes every spec decision.
- **Removable, not toggleable.** Completed tasks are removed entirely (history lives in git log), never marked `[x]`. Removal forces decisions; toggles accumulate noise.
- **No vendor lock-in** (G4). The same file for every agent, the same surface for every backend. Switching either needs no migration.
- **One TASKS.md per repo, optionally federated** (G3). Per-repo files are the source of truth; workspace-mode aggregates them for picking.

## Adoption

Adoption is the only metric that matters: the number of repos with a `TASKS.md` at their root, not the feature count of any package. The spec lands in the wild any time an agent supports `/next-task` or reads `TASKS.md` at the repo root. Ready-made commands ship today for Claude Code, Codex, Cursor, Devin, Gemini CLI, and Windsurf — install via `npx tasks generate-commands` or through the upstream agent's marketplace. When a new agent vendor ships first-class `/next-task` support, that is a milestone.
