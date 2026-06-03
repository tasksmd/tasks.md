---
schema: vision-v1
version: 4
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
    description: A repo exposes one root TASKS.md task surface. In the file backend that file is the source of truth; in generated backends it is the human-readable projection of the backend source. Workspace-mode aggregates per-host and cross-repo queues for picking, but never replaces the per-repo surface.
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
    description: The flagship reason to adopt tasks.md is to run a TEAM of machines — each running a PARALLEL fleet of agents — against one queue with zero duplicate successful claims and deterministic selection for a known state snapshot. tasks.md supplies the agent-readable layer and delegates the collision-free, two-tier coordination to a backend (G5/G6) — git-native by default, because agents are file-native (see Core beliefs); a server-backed queue is offered only where that infra already exists. The two-tier machine fleet is the extreme; the everyday case is any MULTI-CONTRIBUTOR repo where two writers (human or agent) would otherwise collide on TASKS.md — git-native serves both with the same mechanism. The solo case (one agent, one file) is the zero-setup default; the collaborative and fleet cases are what the design must never break.
  - id: G8
    name: Dogfood the collision-free path
    description: The canonical tasks.md repo — and every sibling project its maintainers run — commits to running on the git-native backend it recommends for collaborative repos (the conversion is tracked in TASKS.md and uses the same `tasks migrate` + `fleet init` path consumers run). Once converted, TASKS.md in those repos is a generated snapshot and claims go through the tasks-claims ref. Eating our own dog food is how the migration, conformance, and conflict-free claiming are proven on the projects that define them; a backend the maintainers will not run on their own multi-contributor repo is not a backend we ship as the recommended default. The file backend remains the zero-setup solo default and the reference implementation — dogfooding raises the recommendation for shared repos, it does not retire the file path.
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

> **A tiny, machine-readable standard for AI-agent task queues** — the "what to work on" companion to [AGENTS.md](https://agents.md/)'s "how to work."

## The one job

Every AI coding agent starts a session with the same question: **"What should I work on?"** `tasks.md` answers it with one file at the repo root — `TASKS.md` — that every agent (Claude Code, Cursor, Windsurf, Devin, Codex, Gemini CLI, and 30+ others) can read, claim from, and update through one shared format:

```markdown
# Tasks

## P0
- [ ] Fix the login redirect loop
  - **ID**: fix-login-redirect
  - **Tags**: auth, bug

## P1
- [ ] Add rate-limit headers to the API
  - **ID**: api-rate-limit-headers
  - **Blocked by**: fix-login-redirect
```

An agent reads the queue, picks the highest-priority task that isn't blocked or already taken, claims it, does the work, and removes it — then loops. That's the whole idea. [AGENTS.md](https://agents.md/) tells an agent *how* to work in a repo; `TASKS.md` tells it *what* to work on next.

## The problem it solves

The obvious alternatives each miss the mark for the small, sub-PR work agents do:

- **Issues / Jira** — powerful but heavy, network-bound, and built for humans; there's no lightweight, in-repo "grab the next thing" an agent can just do. (Teams already living there can keep them — as a *backend*, see below.)
- **A plain `TODO.md` checklist** — no priorities, no claims, no dependencies, nothing a tool can check.
- **Each agent's own to-do list** — Claude, Cursor, and the rest each track work their own way, in memory, invisible to the next agent. Nothing is shared or survives the session.

`tasks.md` is the small, shared, file-based standard that fills that gap.

## The hard case it's built for: many writers, one queue

One developer with one agent is the easy case — a single file, zero setup. The case that *shapes* the design is the opposite: **many writers on one queue.** That might be a few teammates and their agents sharing a repo, or — at the extreme — a *fleet* of machines each running a *parallel set of agents*, all draining the same queue at once.

One rule must never break: **no two agents ever hold the same task.** And selection must be predictable — given the same queue, agents pick the same next task by priority, not by luck.

A `TASKS.md` that everyone hand-edits can't promise that: two agents editing the file collide, and a claim isn't visible until it's pushed. So the moment a repo has more than one writer, `tasks.md` swaps the *storage* underneath for a collision-free one — **without changing the file you read**.

## How it works: a thin standard + borrowed coordination

`tasks.md` does **not** build a job scheduler. Collision-free work distribution is a decades-solved problem. So it owns only the thin part nobody has standardised — the portable, agent-readable task layer — and **delegates** the hard machinery to a pluggable *backend*:

| `tasks.md` owns (the portable standard) | A backend provides (the coordination) |
|---|---|
| The markdown format, priorities, tags, blocked-by, claims | Atomic "only one agent gets it" claiming |
| Completion = removal (history lives in git) | Leases, crash recovery, fencing tokens |
| The cross-agent `/next-task` workflow, parser, and linter | Scheduling, locking, multi-machine transport |

The format you read and write is identical no matter which backend is underneath. **The standard is portable; the coordination is borrowed.**

## Backends: one file, several engines

Switching backends is a one-line config change (`.tasksmd.json`), never a migration — the same `TASKS.md`, parser, CLI, and MCP work against all of them:

| Backend | What it is | Use it when |
|---|---|---|
| **File** (default) | a git-synced `TASKS.md` you hand-edit; `(@agent)` claims are best-effort | solo or offline — zero setup |
| **Git-native** (recommended once you have ≥ 2 writers) | claims are **collision-free** via git's atomic compare-and-swap; `TASKS.md` becomes a generated snapshot agents never hand-edit, so it never merge-conflicts. No server, no sidecar — just the repo | a multi-contributor project, or a fleet of machines × agents |
| **GitHub Issues** | issues are the queue (labels = priority, assignee = claim) | a team already living in a tracker |
| **Atomic queue / MCP broker** | a Postgres queue or an MCP server serializes claims | only where that infra already exists |

Building a bespoke coordinator is the last resort — only if no existing backend fits. For the git-native path, `tasks.md` ships just the spec, a runnable **conformance suite** that keeps any backend honest, and a thin reference adapter; heavier engines are added only if real contention ever demands them.

## We eat our own dog food

This repo runs on the **git-native** backend it recommends — its own `TASKS.md` is a generated snapshot, and the one-command `/migrate` path that converted it is the exact path any consumer runs. A backend the maintainers won't trust on their own multi-contributor repo isn't one worth recommending as the default. (The file backend stays the zero-setup default for solo repos — dogfooding raises the bar for shared repos, it doesn't retire the simple path.)

## Where it fits with AGENTS.md

`tasks.md` and [AGENTS.md](https://agents.md/) are two halves of the same idea — they complement, they don't compete:

| Standard | Tells an agent… |
|---|---|
| [AGENTS.md](https://agents.md/) | *how* to work here — conventions, build, tests |
| **TASKS.md** (this standard) | *what* to work on — the prioritized, claimable queue |

AGENTS.md sets the rules of the repo; TASKS.md lists the work; per-agent files (`CLAUDE.md`, Cursor rules) refine behaviour on top of both.

## What it is *not*

- **Not a project-management tool.** No GUI, no time tracking, no assignment model beyond `(@agent)`. Want Jira semantics? Use Jira — or the Issues backend.
- **Not a scheduler or workflow engine.** `TASKS.md` says what work exists, not how it's routed or run. Coordination is delegated to a backend, never built here.
- **Not a dependency graph.** `blocked-by` is a flat list of IDs, not a topological engine. Agents pick; humans curate priority.

## Beliefs that shape every decision

- **Stay thin.** Own the format and the workflow; borrow everything the ecosystem already does well. *Get, don't build.*
- **Agents are file-native.** Agents already read, write, grep, and `git` files all day — so a queue that lives in files + git is one they can actually see and reason about. That's why the collision-free path is git-native, not a server.
- **Tickets are prompts.** ([why](https://dheer.co/tickets-are-prompts/)) A task states the outcome a human wants; the agent works out the how.
- **Done means gone.** Completed tasks are removed, not checked off — history lives in git. Removal forces decisions; checkboxes accumulate noise.
- **No lock-in.** Same file for every agent, same surface for every backend. Switching either takes no migration.

## How we measure success

Adoption — the number of repos with a `TASKS.md` at their root — is the only metric that counts, not any package's feature list. Ready-made `/next-task` commands ship today for Claude Code, Codex, Cursor, Devin, Gemini CLI, and Windsurf (`npx tasks generate-commands`). Every new agent that reads `TASKS.md` or ships first-class `/next-task` support is a milestone.
