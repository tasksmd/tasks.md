# TASKS.md

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

## Agent Commands

The most useful thing about TASKS.md is a single command: "pick the next task and do it." Drop a skill/command file into your agent's config and type `/next-task` to start an autonomous work loop:

| Agent | Install |
|-------|---------|
| Claude Code | `cp -r commands/claude/skills/next-task .claude/skills/` |
| Codex | `cp -r commands/codex/skills/next-task .agents/skills/` |
| Cursor | `cp commands/cursor/next-task.md .cursor/commands/` |
| Gemini CLI | `cp commands/gemini/next-task.toml .gemini/commands/` |
| Windsurf | `cp commands/windsurf/next-task.md .windsurf/workflows/` |

The command reads TASKS.md, picks the highest-priority unblocked task, claims it, does the work, removes it on completion, and loops.

All paths above are **project-local** (inside your repo). Commit the command file so your whole team gets it. See [commands/](commands/) for all source files and format details.

## FAQ

### How is this different from GitHub Issues?

Issues track features for teams. TASKS.md tracks implementation steps for agents. They complement each other — one Issue may produce multiple TASKS.md entries.

### Why not TODO.md?

`TODO.md` has no spec and thousands of incompatible formats in the wild. A "todo list" is a human wish list; a "task queue" is an active work queue for agents. The naming fits the emerging pattern: `AGENTS.md` (instructions), `TASKS.md` (work queue).

Migration: `mv TODO.md TASKS.md`, add P0–P3 headings, convert to checkboxes.

### Do I need an orchestrator?

No. A solo developer with one agent benefits from persistent context across sessions.

### Won't deleting tasks cause merge conflicts?

Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. Conflicts are rare and trivial.

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
