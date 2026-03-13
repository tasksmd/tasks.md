# TASKS.md

A simple, open format for giving coding agents a persistent backlog.

**Your agent loses context between sessions.** You describe a feature, the agent works on it, the session ends — and everything it learned, planned, and queued is gone. Next session, you start from scratch.

TASKS.md fixes this. It's a Markdown file at the root of your repository that persists work across sessions, agents, and tools.

**TASKS.md is a companion to [AGENTS.md](https://agents.md/).** AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` file at the root of your repository:

```markdown
# Tasks

## P0 — Critical

- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh endpoint returns 500 when token is expired
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`

## P1 — Important

- [ ] Add rate limiting to public API endpoints
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: "Fix authentication crash on token refresh"

## P2 — Nice to Have

- [ ] Update README with new API endpoints
```

That's it. Your agent now has a backlog that survives across sessions.

Tell your agent to check TASKS.md — or add it to your [AGENTS.md](#agentsmd-integration):

```markdown
## Task Management
- Check TASKS.md for available work before asking the user
- Claim tasks before starting work
- Remove completed tasks (history is in git log)
```

## Why TASKS.md?

### The problem

AI coding agents are increasingly autonomous — they research, plan, implement, test, and open PRs. But their work is ephemeral. Every session starts from zero.

Developers work around this by pasting context into chat, maintaining personal notes, or hoping the agent figures it out. None of this scales.

### What exists today

| Approach | Limitation |
|----------|------------|
| **Chat prompts** | Lost after the session ends |
| **TODO comments** | Scattered across files, no priority, no structure |
| **GitHub Issues** | Great for project management, but heavyweight for agent scratch work (see [FAQ](#how-is-this-different-from-github-issues)) |
| **Custom files** | Every team invents their own format |

### What TASKS.md provides

- **Persistent** — Survives across sessions, restarts, tool switches
- **Version-controlled** — Tracked in git alongside the code it describes
- **Human-readable** — Plain Markdown. No tooling required.
- **Agent-readable** — Any LLM that reads Markdown can read TASKS.md
- **Vendor-neutral** — Works with any coding agent, today

## Format

### Tasks

A task is a Markdown checkbox list item:

```markdown
- [ ] Short description of the task
```

### Priority

Tasks are organized into priority sections using `##` headings. The spec defines four tiers:

| Section | Meaning |
|---------|---------|
| `## P0 — Critical` | Broken / blocking — fix immediately |
| `## P1 — Important` | Core features and fixes |
| `## P2 — Nice to Have` | Polish, docs, minor improvements |
| `## P3 — Future` | Long-term, aspirational |

Higher sections in the file = higher priority. Agents work top-to-bottom.

### Task Metadata

Tasks can include optional structured metadata:

```markdown
- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: "Upgrade jsonwebtoken to v10"
```

| Field | Purpose |
|-------|---------|
| **Details** | Implementation guidance |
| **Files** | Scope hint — which files to look at |
| **Acceptance** | Definition of done |
| **Blocked by** | Dependency on another task |

All metadata is optional. A bare `- [ ] Fix the bug` is a valid task.

### Sub-tasks

```markdown
- [ ] Implement user authentication
  - [x] Design auth schema
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
  - [ ] Add token refresh endpoint
```

### Lifecycle

- **Add** tasks as you discover work (humans or agents)
- **Complete** by checking the box: `- [x] Task description`
- **Remove** completed tasks — history lives in git log

See the [full specification](spec.md) for details.

## Multi-Agent Coordination

When multiple agents work in the same repo, TASKS.md provides a lightweight coordination layer.

```markdown
## P1 — Important

- [ ] Add rate limiting to API (@cascade-1 — in progress)
- [ ] Migrate to prepared SQL statements
- [x] Fix CORS headers (@claude-code)
```

### Claiming Protocol

1. **Read** — Agent reads TASKS.md, finds the first unclaimed, unblocked task
2. **Claim** — Agent appends `(@agent-name — in progress)` and commits
3. **Work** — Agent implements the task
4. **Complete** — Agent marks `[x]` with attribution
5. **Cleanup** — Completed tasks are removed

### Limitations

This is a **best-effort protocol**, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice, this is rare — agents typically work on different timescales and the claim window is small. For stronger guarantees, use an MCP server as a coordination backend with TASKS.md as the human-readable view.

Stale claims (from crashed agents) should be reclaimed by other agents after a reasonable period. The spec does not define a timeout — teams should document their convention in AGENTS.md.

## AGENTS.md Integration

Add a task management section to your AGENTS.md:

```markdown
# AGENTS.md

## Task Management
- Check TASKS.md for available work before asking the user
- Claim tasks before starting work
- Remove completed tasks (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

This is how agents learn about TASKS.md today. As tool vendors add native support, this section becomes optional.

## Works With Any Agent

TASKS.md uses plain Markdown checkboxes — the most universal format. Any agent that reads Markdown can read TASKS.md. No special parser, MCP server, or tooling required.

## Examples

See the [examples/](examples/) directory:
- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)

## FAQ

### How is this different from GitHub Issues?

GitHub Issues is a project management tool for teams. TASKS.md is a lightweight, in-repo backlog for agents.

| | GitHub Issues | TASKS.md |
|-|---------------|----------|
| **Audience** | Teams, PMs, contributors | Coding agents |
| **Granularity** | Features, bugs, epics | Implementation steps |
| **Access** | API / web UI | `cat TASKS.md` |
| **Works offline** | No | Yes |
| **In the repo** | No (metadata) | Yes (version-controlled) |
| **Setup** | Built into GitHub | One file, any git host |

They complement each other. A GitHub Issue might say "Add user authentication." TASKS.md breaks that into implementation steps the agent can execute.

### Why not TODO.md?

`TODO.md` is a recognized convention, but it has baggage — it's often a dumping ground of aspirational items with no structure, priority, or ownership. TASKS.md signals a managed backlog with a defined format. The name also parallels AGENTS.md.

### Do I need multiple agents to benefit?

No. The simplest use case is **one developer, one agent, persistent context**. You describe work in TASKS.md, your agent picks it up next session without you repeating yourself. Multi-agent coordination is the advanced chapter.

### What if TASKS.md is empty?

The agent should ask the user what to work on, or look for other signals (open PRs, failing tests, TODO comments in code). An empty TASKS.md is not an error.

### Can agents add their own tasks?

Yes. Agents often discover work during implementation ("this function also needs refactoring," "found a bug in the adjacent module"). They should add these to TASKS.md for the next session.

## Contributing

We welcome contributions. Open an issue or PR to:
- Improve the [specification](spec.md)
- Add examples for your stack
- Propose extensions
- Share how TASKS.md works (or doesn't) with your agent

## License

[MIT](LICENSE)

## About

TASKS.md emerged from real-world multi-agent development workflows where multiple AI coding agents work in the same repository simultaneously. It started as a team convention, grew into a structured format, and is now proposed as an open standard.

We aim to work with the [AGENTS.md](https://agents.md/) community and the [Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/) to establish TASKS.md as a companion standard.
