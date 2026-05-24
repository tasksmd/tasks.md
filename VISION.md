---
schema: vision-v1
version: 1
last_reviewed: 2026-05-23
goals:
  - id: G1
    name: Spec first, packages second
    description: spec.md is canonical. parser, lint, mcp, cli are reference implementations that exist to validate the spec.
  - id: G2
    name: Cross-agent commands are generated, not hand-edited
    description: commands/next-task.md and commands/lint-tasks.md are canonical; per-agent variants regenerate. CI rejects manual edits to generated variants.
  - id: G3
    name: One TASKS.md per repo, optionally federated
    description: Workspace-mode aggregates per-host queues; per-repo queues stay the source of truth.
  - id: G4
    name: No vendor lock-in
    description: Every agent that adopts the spec works against the same file. Switching agents requires no migration.
non_goals:
  - id: NG1
    name: Not a project management tool
    description: No GUI, no team assignments beyond claim suffixes, no time tracking. Use Jira/Linear for those.
  - id: NG2
    name: Not a workflow engine
    description: TASKS.md describes what work exists, not how it gets routed.
  - id: NG3
    name: Not a graph database
    description: Blocked-by edges are a flat list, not a topological sort.
---

# Vision

> **A lightweight, machine-readable spec for AI agent task queues.** The "what to work on" companion to [AGENTS.md](https://agents.md/)'s "how to work."

## Who it's for

**Primary audience: any team that has AI agents picking up coding work.** Today's agents (Claude Code, Cursor, Windsurf, Devin, Codex, Gemini CLI, Codium, OpenHands, and 30+ others) need a way to ask *"what should I work on?"* and get back a structured, prioritized, tooling-friendly answer.

The current options all fail:
- **GitHub Issues** — too heavy for sub-PR-sized work, no priority semantics, no claim mechanics, requires network.
- **Plain markdown checklists** — no parser, no lint, no claims, no metadata.
- **Per-tool todo formats** — fragment by agent. A task written for Claude can't be picked up by Cursor.

`tasks.md` is the open standard that fills the gap: one file, one spec, parsed by `@tasks-md/parser`, validated by `@tasks-md/lint`, exposed via `tasks-mcp`, manipulated through `@tasks-md/cli`, and consumed by `/next-task` skills in every major agent.

## Strategy: spec first, packages second

The format is the product. The TypeScript packages and MCP server are reference implementations — they exist to validate the spec and bootstrap adoption.

1. **Spec is canonical.** [`spec.md`](spec.md) defines TASKS.md format. Examples in [`examples/`](examples/) are normative fixtures. Behavior shifts in `spec.md` propagate to parser, lint, MCP, CLI, and every `/next-task` variant in the same commit.
2. **Reference packages stay small.** Each of `parser`, `lint`, `mcp`, `cli` does exactly one thing. No package gains features that don't serve the spec.
3. **Cross-agent commands are generated, not hand-edited.** [`commands/next-task.md`](commands/next-task.md) and [`commands/lint-tasks.md`](commands/lint-tasks.md) are the canonical sources; per-agent variants under `commands/{claude,codex,cursor,devin,gemini,windsurf}/` regenerate from those. CI rejects manual edits to generated variants.

## Non-goals

- **A project management tool.** No GUI, no team assignments beyond `(@agent-id)` claim suffixes, no time tracking. If you need Jira/Linear semantics, integrate with those tools — don't reinvent them in tasks.md.
- **A workflow engine.** TASKS.md describes what work exists, not how it gets routed. Routing belongs to the agent + the human supervising it.
- **A graph database.** Blocked-by edges are a flat list, not a topological sort. Agents pick tasks; humans curate priority.

## Core beliefs

- **Tickets are agent prompts.** ([source](https://dheer.co/tickets-are-prompts/)) Tasks describe the outcome a human wants, not the implementation. The agent decomposes. This belief shapes every spec decision.
- **Removable, not toggleable.** Completed tasks are *removed entirely* (history lives in git log), not marked `[x]`. Toggles accumulate noise; removal forces decisions.
- **One TASKS.md per repo, optionally federated.** Workspace-mode (planned) aggregates per-host queues; per-repo queues stay the source of truth.
- **No vendor lock-in.** Every agent that adopts the spec works against the same file. Switching agents doesn't require migration.

## Where this fits in the agent ecosystem

| Spec | Tells agents… | Maintained by |
|---|---|---|
| [AGENTS.md](https://agents.md/) | *how* to work in this repo (conventions, tests, build) | The agents.md community |
| **TASKS.md (this spec)** | *what* to work on (queue, priority, claims) | tasksmd contributors |
| [Devin instructions](https://devin.ai/docs) / Claude `CLAUDE.md` / Cursor rules | per-agent customization on top of AGENTS.md | Each agent vendor |

The three layers compose: AGENTS.md sets repo conventions, TASKS.md lists work, agent-specific files refine behavior.

## Adoption

The spec lands in the wild any time an agent supports `/next-task` or reads `TASKS.md` at the repo root. The current `commands/` directory ships skill/command variants for Claude Code, Codex, Cursor, Devin, Gemini CLI, and Windsurf — install via `npx tasks generate-commands` or via the upstream agent's marketplace.

Adoption is the only metric that matters. The spec's success is measured by how many repos have a TASKS.md at their root, not by how many features `@tasks-md/cli` ships.
