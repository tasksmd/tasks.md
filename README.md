# TASKS.md

A convention for AI agent task queues — the companion to [AGENTS.md](https://agents.md/).

AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` at your repo root:

```markdown
# Tasks (v0.4)

## P0

- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints
  - **Blocked by**: "Fix authentication crash on token refresh"

## P2

- [ ] Update README with new API endpoints
```

Add this to your AGENTS.md:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-name) before starting work
- Remove completed tasks from the file (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

That's it. Any agent that reads Markdown can now work from your task queue.

## Why TASKS.md?

Every agent and orchestrator invents its own task format — JSON, YAML, database rows, chat context. Tasks get lost between sessions. Humans can't see the agent's backlog. Multiple agents can't share a queue.

TASKS.md is one Markdown file that any tool can read and write:

- **Persistent** — Survives sessions, restarts, tool switches
- **Version-controlled** — In git, next to the code
- **Human-readable** — Edit in any text editor
- **Agent-readable** — Any LLM parses Markdown natively
- **Vendor-neutral** — Works with any tool, today

## How It Works

1. **Write** tasks under P0–P3 priority headings
2. **Agent** reads the file, claims a task with `(@agent-name)`, implements it
3. **Remove** the task when done — history lives in git log

Agents claim different tasks, so removals target different lines and merge cleanly.

## The Format

**Priority**: Four headings — `## P0` through `## P3` — following the [industry-standard severity scale](https://en.wikipedia.org/wiki/Severity_(engineering)) (PagerDuty, Google SRE).

**Tasks**: Markdown checkboxes. Names should be unique — they serve as identifiers for blocker references.

**Metadata**: Optional nested fields — **Details**, **Files**, **Acceptance**, **Blocked by**.

**Blockers**: Reference tasks by quoted name: `**Blocked by**: "Fix auth crash"`. A task is unblocked when the referenced task is removed from the file.

**Sub-tasks**: Nested checkboxes under a parent. Mark `[x]` as you go. Remove the entire block when the parent is fully done.

**Multiple files**: One root `TASKS.md` for small repos. Subdirectory files for monorepos. Agent walks up from working directory to find the nearest file, also reads root.

See the [full specification](spec.md) for details.

## Examples

- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)

## FAQ

### How is this different from GitHub Issues?

Issues track features for teams. TASKS.md tracks implementation steps for agents. They complement each other — one Issue may produce multiple TASKS.md entries.

### Why not TODO.md?

`TODO.md` has no spec and thousands of incompatible formats in the wild. A "todo list" is a human wish list; a "task queue" is an active work queue for agents. The naming also fits the emerging convention: `AGENTS.md` (instructions), `TASKS.md` (work queue).

Migration: `mv TODO.md TASKS.md`, add P0–P3 headings, convert to checkboxes.

### Do I need an orchestrator?

No. A solo developer with one agent benefits from persistent context across sessions.

### Won't deleting tasks cause merge conflicts?

Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. Conflicts are rare and trivial.

## Contributing

- Improve the [specification](spec.md)
- Add examples for your stack
- Share how TASKS.md works with your tool

## License

[MIT](LICENSE)
