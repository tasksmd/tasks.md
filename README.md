# TASKS.md

[![CI](https://github.com/tasksmd/tasks.md/actions/workflows/ci.yml/badge.svg)](https://github.com/tasksmd/tasks.md/actions/workflows/ci.yml)

A lightweight spec for AI agent task queues — the companion to [AGENTS.md](https://agents.md/).

**[Website](https://tasksmd.github.io/tasks.md/)** · **[Spec](spec.md)** · **[Examples](examples/)** · **[MCP Server](mcp/)**

AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` at your repo root:

```markdown
# Tasks

## P0

- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints
  - **Blocked by**: auth-fix
- [ ] Migrate database queries to prepared statements

## P2

- [ ] Update README with new API endpoints
```

Most tasks are just checkboxes under priority headings. Tasks with dependencies get an **ID** so blockers can reference them stably. All metadata is optional.

Then add this to your `AGENTS.md` so agents know to use it:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-name) before starting work
- Remove completed tasks from the file (history is in git log)
```

That's it. Your agent will read TASKS.md on session start and work through the queue.

## Why TASKS.md?

**You think faster than agents can code.** Ideas come in bursts — while an agent implements one feature, you've already thought of three more. Without a queue, those ideas live in your head or scatter across chat windows. TASKS.md is your buffer: write tasks down as they come, and agents work through them at their own pace.

**Planning first leads to better results.** When you write a task down — even a one-liner — you're forced to think about what you actually want before the agent starts coding. That small act of planning is the difference between an agent that builds the right thing and one that guesses. TASKS.md makes planning the natural first step, not an afterthought.

**One Markdown file that any tool can read and write:**

- **Persistent** — Survives sessions, restarts, tool switches
- **Version-controlled** — In git, next to the code
- **Human-readable** — Edit in any text editor
- **Agent-readable** — Any LLM parses Markdown natively
- **Vendor-neutral** — Works with any tool, today

## How It Works

1. **Plan** — Write tasks under P0–P3 priority headings as ideas come to you
2. **Delegate** — Agent reads the file, claims a task with `(@agent-name)`, implements it
3. **Remove** — Completed tasks are deleted from the file; history lives in git log
4. **Repeat** — You keep adding tasks while agents keep working through them

You're always adding to the queue; agents are always draining it. No ideas get lost, and agents never run out of work.

## The Format

**Priority**: `## P0` through `## P3` — a widely-used priority scale (PagerDuty, Google SRE).

**Tasks**: Markdown checkboxes. Should be completable in a single agent session.

**IDs**: An `**ID**: kebab-case` metadata field on tasks referenced as blockers. Stable — don't change once assigned.

**Blockers**: `**Blocked by**: auth-fix, rate-limit` — references task IDs across all files. A task is unblocked when the referenced IDs are no longer in any file.

**Tags**: `**Tags**: backend, auth` — lowercase labels for filtering and orchestrator routing to specialized agents.

**Metadata**: Optional nested fields — **ID**, **Tags**, **Details**, **Files**, **Acceptance**, **Blocked by**. Teams can add custom fields beyond these six.

**Sub-tasks**: Nested checkboxes under a parent. Metadata first, then sub-tasks. The agent who claims the parent owns all sub-tasks. Remove the entire block when fully done.

**Multiple files**: One root `TASKS.md` for small repos. Subdirectory files for monorepos. Agent searches from the git root down to find all files. Split when a file exceeds ~50 tasks.

See the [full specification](spec.md) for all details.

## Examples

- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)
- [Complex tasks](examples/complex-tasks.md) — multiline details, rich acceptance criteria, sub-tasks with metadata
- [Python API](examples/python-api.md) — FastAPI with SQLAlchemy, pytest, mypy, ruff
- [Rust CLI](examples/rust-cli.md) — Cargo project with clippy, assert_cmd, crates.io publishing
- [Mobile app](examples/mobile-app.md) — React Native with biometrics, offline sync, Detox E2E

## Writing Good Tasks

The quality of your task description directly affects the quality of the agent's output. A task is a small contract between you and the agent — the more specific you are, the better the result.

**A one-liner is fine for obvious work:**

```markdown
- [ ] Add input validation to the /users endpoint
```

**Add metadata when the task needs context:**

```markdown
- [ ] Fix race condition in WebSocket reconnect
  - **Details**: When the server restarts, clients reconnect but sometimes
    miss messages sent during the reconnect window. Add a sequence number
    to messages and request missed messages after reconnecting.
  - **Files**: `src/ws/client.ts`, `src/ws/server.ts`
  - **Acceptance**: No dropped messages during server restart in integration test
```

**Tips for writing tasks agents can actually complete:**

- **One session, one task** — If it takes you more than a sentence to describe, it might be two tasks
- **Include file paths** — Agents explore faster when they know where to look
- **Define "done"** — An **Acceptance** field turns a vague ask into a testable outcome
- **Use IDs for dependencies** — If task B depends on task A, give A an **ID** and add `**Blocked by**: task-a` to B. The agent will skip B until A is gone.

## The `/next-task` Command

The most useful thing about TASKS.md is a single command: "pick the next task and do it." Install the command for your agent, then type `/next-task` to start an autonomous work loop.

### Install

Copy the command file into your project (commit it so your team gets it too):

| Agent | Install |
|-------|---------|
| Claude Code | `cp -r commands/claude/skills/next-task .claude/skills/` |
| Codex | `cp -r commands/codex/skills/next-task .agents/skills/` |
| Cursor | `cp commands/cursor/next-task.md .cursor/commands/` |
| Gemini CLI | `cp commands/gemini/next-task.toml .gemini/commands/` |
| Windsurf | `cp commands/windsurf/next-task.md .windsurf/workflows/` |

All paths are **project-local** (inside your repo). See [commands/](commands/) for source files and format details.

### What it does

When you type `/next-task`, the agent runs a 6-step loop:

1. **Find** — Discovers all `TASKS.md` files from the git root down
2. **Pick** — Selects the highest-priority unblocked, unclaimed task. Prefers tasks that unblock others (impact-first). Resumes previously claimed tasks if it finds its own `(@agent-id)`.
3. **Claim** — Appends `(@agent-id)` to the task line so other agents skip it
4. **Work** — Reads the task's metadata, checks AGENTS.md for project conventions, makes changes, runs tests
5. **Complete** — Removes the entire task block from TASKS.md, commits, pushes
6. **Loop** — Reads TASKS.md again, picks the next task, continues until the queue is empty

### The workflow

```
You                              Agent
──────────────────               ──────────────────
Write tasks as ideas come  →     /next-task
Add more tasks             →     Claims P0 task, starts working
Add more tasks             →     Completes task, picks next one
Review agent's commits     ←     Commits, removes task, loops
Add more tasks             →     ...keeps draining the queue
```

You're always adding to the queue. The agent is always draining it. This is the core loop — planning is your job, execution is the agent's.

## FAQ

### How is this different from GitHub Issues?

Issues track features for teams. TASKS.md tracks implementation steps for agents. They complement each other — one Issue may produce multiple TASKS.md entries.

### Why not TODO.md?

`TODO.md` has no spec and thousands of incompatible formats in the wild. A "todo list" is a human wish list; a "task queue" is an active work queue for agents. The naming fits the emerging pattern: `AGENTS.md` (instructions), `TASKS.md` (work queue).

Migration: `mv TODO.md TASKS.md`, add P0–P3 headings, convert to checkboxes.

### Do I need an orchestrator?

No. A solo developer with one agent benefits from persistent context across sessions. You write tasks, the agent works through them. An orchestrator helps when you have multiple agents, but it's not required.

### Won't deleting tasks cause merge conflicts?

Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. Conflicts are rare and trivial.

### How detailed should my tasks be?

As detailed as needed for the agent to succeed without asking you. A one-liner works for obvious changes (`Add input validation to /users`). For anything ambiguous, add **Details**, **Files**, and **Acceptance** so the agent knows what to do, where to look, and when it's done.

### Can I use TASKS.md without AI agents?

Yes. It works as a personal backlog for any developer. The format is just prioritized Markdown checkboxes — you don't need an agent to benefit from writing tasks down before starting work. The planning habit alone improves outcomes.

### How do I handle tasks that are too big for one session?

Break them into sub-tasks or split them into separate tasks with dependencies. If a task takes more than one sentence to describe, it's probably two tasks. Use **Blocked by** to order them:

```markdown
- [ ] Set up auth database schema
  - **ID**: auth-schema

- [ ] Implement JWT token refresh
  - **Blocked by**: auth-schema
```

### What happens when an agent gets stuck?

The agent should tell you it's stuck and move on to the next task. The stuck task stays in the queue with its `(@agent-id)` claim. You can either add more detail to help the next attempt, or remove the claim so another agent (or a fresh session) can try.

### Can multiple agents work on the same TASKS.md?

Yes — that's what the claiming mechanism is for. Each agent appends `(@agent-id)` to the task it picks up. Other agents see the claim and skip to the next unclaimed task. In multi-agent setups, agents should commit and push claims immediately to avoid races.

### Should I keep completed tasks in the file?

No. Remove them. Git log is your history. Keeping completed tasks in the file adds noise and makes it harder for agents to scan the queue. The spec enforces this — `tasks-lint` will flag checked-off tasks as errors.

### How does TASKS.md relate to AGENTS.md?

They're companions. AGENTS.md tells agents how your project works (build commands, conventions, architecture). TASKS.md tells agents what to work on (prioritized queue). Together, an agent can start a session, read both files, and be immediately productive — no human prompting needed.

## See Also

- [AGENTS.md](https://agents.md/) — the companion spec for agent instructions
- [Proposal: TASKS.md as a companion standard](https://github.com/agentsmd/agents.md/issues/166) — discussion on the agents.md repo

## Contributing

- Improve the [specification](spec.md)
- Add [examples](examples/) for your stack
- Add or improve [agent commands](commands/) for your tool
- Open an issue or PR on [GitHub](https://github.com/tasksmd/tasks.md)

## License

[MIT](LICENSE)
