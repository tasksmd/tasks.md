# Agent-native to-do tools (Claude, Cursor, Windsurf, Codex)

**What they are.** The task lists agents keep *for themselves* while working. Claude Code has a built-in to-do tool (a planning list, more recently persisted under `~/.claude/`); Cursor and Windsurf have task/workflow plugins and MCP servers that store plans under project dotfolders; Codex tracks a goal/plan for a single autonomous run. They're how an agent breaks down *its own* current job.

**How they overlap with `tasks.md`.** Both are lists of tasks with status and (sometimes) dependencies, used to drive multi-step work. Both are markdown- or JSON-shaped and agent-readable.

**How `tasks.md` differs.**
- **Ephemeral / vendor-locked vs. shared.** These lists live in one agent's memory or its own vendor directory. The *next* agent — or a teammate's agent — can't see them. `TASKS.md` is one file in the repo that every agent reads.
- **A plan vs. a queue.** They capture *how this agent will do the task it already has*. `tasks.md` answers the prior question — *which task to pick next* — across sessions and agents.
- **No cross-agent claiming.** Two agents with their own to-do lists have no shared notion of "taken." `tasks.md`'s git-native backend gives them one.

**Our stance.** **Complementary layers, not rivals.** An agent reads `TASKS.md` to choose the next task, then uses its own to-do tool to plan the steps of that one task. **Borrow:** their structured status + `blockedBy` metadata models are a good reference for keeping `tasks.md` metadata machine-parseable.
