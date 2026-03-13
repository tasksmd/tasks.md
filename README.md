# TASKS.md

A standard task queue format for AI coding agents and orchestrators.

**TASKS.md is a companion to [AGENTS.md](https://agents.md/).** AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` at the root of your repository:

```markdown
# Tasks

## P0 — Critical

- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1 — Important

- [ ] Add rate limiting to public API endpoints
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: "Fix authentication crash on token refresh"

## P2 — Nice to Have

- [ ] Update README with new API endpoints
```

Add this to your AGENTS.md so agents know about it:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Why TASKS.md?

Agent orchestrators — systems like [Bosun](https://github.com/fivanishche/bosun), [OpenHands](https://github.com/All-Hands-AI/OpenHands), GitHub Copilot coding agent, and [Factory Droids](https://factory.ai) — decompose work into tasks and assign them to coding agents. But there is no standard format for the task queue.

Every orchestrator invents its own: custom JSON, YAML configs, database rows, ephemeral chat context. The result:

- **No portability** — Tasks are locked inside a specific orchestrator
- **No persistence** — Work is lost when a session or pipeline ends
- **No visibility** — Humans can't see or edit the agent's backlog
- **No coordination** — Multiple agents can't share a queue

TASKS.md solves this with one Markdown file:

- **Persistent** — Survives across sessions, restarts, tool switches
- **Version-controlled** — Tracked in git alongside the code
- **Human-readable** — Plain Markdown, editable in any text editor
- **Agent-readable** — Any LLM that reads Markdown can parse it
- **Vendor-neutral** — Works with any orchestrator or agent

## How It Works

```
┌─────────────┐     writes      ┌──────────┐     reads      ┌─────────┐
│ Orchestrator │ ──────────────> │ TASKS.md │ <────────────── │  Agent  │
│  (planner)   │                 │          │ ──────────────> │ (coder) │
└─────────────┘     reads       └──────────┘     writes      └─────────┘
                  completions                   claims/removes
```

1. **Orchestrator** (or human) writes tasks to TASKS.md
2. **Agent** reads the file, claims a task, implements it, removes the task when done
3. **Orchestrator** monitors the file, resolves blockers, adds follow-up tasks

This works whether the orchestrator is a background server, a CI pipeline, or a human running agents from chat.

## Format

The format is strict. One way to do things.

### Priority

Four tiers, fixed names, fixed order:

| Section | Meaning |
|---------|---------|
| `## P0 — Critical` | Broken / blocking — fix immediately |
| `## P1 — Important` | Core features and fixes |
| `## P2 — Nice to Have` | Polish, docs, improvements |
| `## P3 — Future` | Long-term, aspirational |

Higher sections = higher priority. Agents work top-to-bottom.

### Tasks

Markdown checkboxes. One line per task:

```markdown
- [ ] Fix the bug                              # pending
- [ ] Add rate limiting (@cursor-1)            # claimed
```

Completed tasks are removed from the file. History lives in git log.

### Metadata

Four fields, no more:

| Field | Purpose |
|-------|---------|
| **Details** | Implementation guidance |
| **Files** | Relevant file paths |
| **Acceptance** | Definition of done |
| **Blocked by** | Dependency on another task |

All optional. A bare `- [ ] Fix the bug` is valid.

### Claiming

Agents claim tasks by appending `(@agent-id)`. Format: `@<tool>-<instance>`.

```markdown
- [ ] Add rate limiting (@cascade-1)           # claimed by cascade-1
```

Claiming is best-effort, not a lock. See [full spec](spec.md) for details.

### Completion

Remove the task from the file. Commit TASKS.md separately from code:

```
git pull --rebase
git add TASKS.md
git commit -m "tasks: complete 'Fix authentication crash'"
```

This is safe because each agent works on a different task (different line). Git auto-merges non-adjacent line deletions.

See the [full specification](spec.md) for all rules and edge cases.

## Examples

See the [examples/](examples/) directory:
- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)

## FAQ

### How is this different from GitHub Issues?

GitHub Issues tracks features and bugs for teams. TASKS.md tracks implementation steps for agents.

| | GitHub Issues | TASKS.md |
|-|---------------|----------|
| **Audience** | Teams, PMs, contributors | Agents, orchestrators |
| **Granularity** | Features, bugs, epics | Implementation steps |
| **Access** | API / web UI | `cat TASKS.md` |
| **In the repo** | No (metadata) | Yes (version-controlled) |
| **Setup** | GitHub-specific | One file, any git host |

They complement each other. A GitHub Issue says "Add auth." TASKS.md breaks that into steps an agent can execute.

### Why not TODO.md?

`TODO.md` has baggage — it's often a dumping ground with no structure, priority, or ownership. TASKS.md is a managed queue with a strict format. The name parallels AGENTS.md.

### Do I need an orchestrator?

No. A solo developer with one agent benefits too — TASKS.md persists your backlog across sessions. But the format is designed so orchestrators can also read and write it programmatically.

### Won't deleting tasks cause merge conflicts?

No. Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. Agents also commit TASKS.md separately from code and pull before committing, which keeps the conflict window minimal.

### Can agents add tasks?

Yes. Agents discover work during implementation ("this function needs refactoring," "found a bug"). They add new tasks to TASKS.md for the next cycle.

## Contributing

Open an issue or PR to:
- Improve the [specification](spec.md)
- Add examples for your stack
- Share how TASKS.md works with your orchestrator or agent

## License

[MIT](LICENSE)

## About

TASKS.md emerged from building [Bosun](https://github.com/fivanishche/bosun), an agent orchestrator that coordinates multiple AI coding agents in the same repository. We needed a standard format for the task queue — something agents could read, claim, and complete without conflicts. TASKS.md is that format.

We aim to work with the [AGENTS.md](https://agents.md/) community and the [Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/) to establish TASKS.md as a companion standard.
