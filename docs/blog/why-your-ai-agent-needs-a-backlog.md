# Why Your AI Agent Needs a Backlog

You think faster than agents code. That's the fundamental mismatch nobody talks about.

While an AI agent spends 10 minutes implementing a feature, you've already thought of three more things that need to happen. By the time it finishes, you've forgotten one of them. The other two are half-remembered fragments you'll reconstruct later — if you're lucky.

This is the **async buffer problem**, and it's the reason your AI-assisted projects leak ideas.

## The fragmentation problem

Without a task queue, work fragments across:

- **Chat history** — buried in conversation threads you'll never search
- **Your head** — context that evaporates between sessions
- **TODO comments** — scattered across files, invisible to agents
- **Sticky notes** — physical artifacts an AI literally cannot read

Every time you start a new agent session, you spend the first few minutes re-explaining context. What's done, what's not, what's blocked. This is pure overhead — and it compounds. The bigger the project, the worse it gets.

## The planning-first insight

Here's the thing nobody tells you about working with AI agents: **writing the task down before the agent starts produces dramatically better results.**

Not because the task description is so perfect. Because the act of writing forces you to think about scope, dependencies, and acceptance criteria *before* the agent starts coding. You catch the edge cases. You notice the blocker. You realize the task is actually three tasks.

This is the same insight behind TDD, but for agent-assisted development. Spec first, code second.

## AGENTS.md solved "how" — TASKS.md solves "what"

[AGENTS.md](https://agents.md) was the breakthrough that gave AI agents shared instructions. It told agents *how* to work in your codebase — coding style, testing requirements, architecture decisions.

But it didn't tell them *what* to work on.

TASKS.md fills that gap. It's a structured task queue that lives in your repo, right next to your code:

```markdown
# Tasks

## P0

- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: src/auth/refresh.ts

## P1

- [ ] Add rate limiting to public API endpoints
  - **Blocked by**: auth-fix
```

It's just Markdown. Any agent can read it. Any agent can write to it. No database, no API, no vendor lock-in.

## Where this proved invaluable

I learned this the hard way while building a multi-agent orchestrator — a system with background pipelines, personas, MCP servers, and cross-repo configuration management. The kind of project where ideas accumulate faster than any single agent can handle.

At any given moment I'd have a dozen things in flight: a bug in the pipeline executor, a missing MCP tool, a deployment script that needed a new flag, a doctor check that was stale, a skill that needed updating across three repos.

Without TASKS.md, I was the bottleneck. I'd finish one thing, then spend five minutes trying to remember what was next. Sometimes I'd duplicate work. Sometimes I'd forget a task entirely and rediscover it a week later.

With TASKS.md, the dynamic changed completely:

- **Brain dump immediately.** Thought of something? `add_task` and move on. Two seconds. The idea is captured with priority, tags, and blockers.
- **Any agent picks up where any agent left off.** No re-explaining context. The task file *is* the context.
- **Dependencies are explicit.** `Blocked by: auth-fix` means no agent wastes time on rate limiting until auth is done.
- **Completion is visible.** Finished tasks get removed. The file only shows what's left. You can feel the queue shrinking.

Over three repos and dozens of automation tasks, TASKS.md turned a chaotic backlog of ideas into a clean, prioritized queue that agents could work through autonomously.

## The key habit

The habit is simple: **write the task down before you or the agent starts working on it.**

Not after. Not "I'll remember this." Before.

```
- [ ] Add --merge flag to sync-issues
  - **Details**: Preserve manual tasks when syncing GitHub issues.
    Currently overwrites the entire file.
  - **Acceptance**: Manual tasks survive a sync, closed issues removed
```

That took 15 seconds to write. It saved 15 minutes of mid-implementation scope creep, and it created a permanent record that any agent in any session can pick up.

## Getting started

Create a `TASKS.md` at your repo root:

```bash
npx tasks-md init
```

Or just create the file manually — it's Markdown with priority headings:

```markdown
# Tasks

## P0

- [ ] Your most critical task here

## P1

- [ ] Important but not urgent
```

Add the [MCP server](https://github.com/tasksmd/tasks.md/tree/main/mcp) so agents can read and write tasks programmatically. Add the [linter](https://github.com/tasksmd/tasks.md/tree/main/lint) to CI to keep the file clean.

Then build the habit. Every time you think of something — `add_task`. Every time an agent finishes — `complete_task`. Every time you start a session — `pick_task`.

Your AI agent is only as productive as the queue you give it.

---

*[TASKS.md](https://github.com/tasksmd/tasks.md) is an open spec for AI agent task queues. It's the companion to [AGENTS.md](https://agents.md).*
