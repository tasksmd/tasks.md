# TASKS.md

A convention for AI agent task queues — the companion to [AGENTS.md](https://agents.md/).

AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` at the root of your repository:

```markdown
<!-- tasks-spec: 0.3 -->
# Tasks

## P0

- [ ] Fix authentication crash on token refresh `#auth-fix`
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints `#rate-limit`
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: `#auth-fix`

## P2

- [ ] Update README with new API endpoints `#update-docs`
```

Tell your agent about it in AGENTS.md:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Why TASKS.md?

AI agents and orchestrators decompose work into tasks. But every tool invents its own format — custom JSON, YAML configs, database rows, ephemeral chat context. The result:

- **No portability** — Tasks are locked inside a specific tool
- **No persistence** — Work is lost when a session ends
- **No visibility** — Humans can't see or edit the agent's backlog
- **No coordination** — Multiple agents can't share a queue

TASKS.md is a single Markdown file that any agent, orchestrator, or human can read and write:

- **Persistent** — Survives across sessions, restarts, tool switches
- **Version-controlled** — Tracked in git alongside the code
- **Human-readable** — Plain Markdown, editable in any text editor
- **Agent-readable** — Any LLM that reads Markdown can parse it
- **Vendor-neutral** — Works with any tool, today

## How It Works

```
┌─────────────┐     writes      ┌──────────┐     reads      ┌─────────┐
│ Orchestrator │ ──────────────> │ TASKS.md │ <────────────── │  Agent  │
│  (planner)   │                 │          │ ──────────────> │ (coder) │
└─────────────┘     reads       └──────────┘     writes      └─────────┘
                  completions                   claims/removes
```

1. **Orchestrator** (or human) writes prioritized tasks to TASKS.md
2. **Agent** reads the file, claims a task, implements it, removes it when done
3. **Orchestrator** monitors completions, resolves blockers, adds follow-up tasks

This works whether the orchestrator is a server, a CI pipeline, or a human running agents from chat.

## Format

### Priority — P0 through P3

| Heading | When to use |
|---------|-------------|
| `## P0` | System is broken or users are blocked. Drop everything. |
| `## P1` | Core work that must ship. Default for planned features. |
| `## P2` | Valuable but not blocking. Do after P0/P1 are clear. |
| `## P3` | Someday. Kept for reference, not actively worked. |

Higher = more urgent. Agents work top-to-bottom. Empty sections can be omitted.

### Tasks and IDs

Markdown checkboxes with optional stable IDs:

```markdown
- [ ] Fix auth crash `#auth-fix`                  # pending
- [ ] Add rate limiting `#rate-limit` (@cursor-1)  # claimed
```

IDs (`` `#kebab-case` ``) are stable references that don't break when you edit the description. They're used for [blockers](#blockers) and cross-file references in monorepos.

A bare `- [ ] Fix the typo` is also valid — IDs are optional for simple tasks.

### Metadata

Four optional fields as nested bold-label items:

```markdown
- [ ] Fix auth crash `#auth-fix`
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: `#jwt-upgrade`
```

### Blockers

Blockers reference **task IDs**, not descriptions — so they don't break when wording changes:

```markdown
- [ ] Deploy to production `#deploy`
  - **Blocked by**: `#auth-fix`, `#rate-limit`
```

A blocked task is unblocked when the referenced IDs are no longer in any TASKS.md file (meaning those tasks were completed and removed).

### Claiming and Completion

- **Claim**: Append `(@agent-id)` to the task line before starting work
- **Complete**: Remove the task (line + metadata) from the file. History is in git log.

Each agent claims a different task, so removals target different lines and merge cleanly.

### Multiple Files

Small repos use one `TASKS.md` at the root. Large repos and monorepos can scope work with additional files in subdirectories:

```
my-project/
├── TASKS.md             # project-wide tasks
├── packages/
│   ├── api/TASKS.md     # API-specific tasks
│   └── web/TASKS.md     # web-specific tasks
```

Task IDs must be unique across all files in the repo.

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

We considered improving `TODO.md` instead of creating a new convention. Here's why we didn't:

**No existing spec.** There are thousands of `TODO.md` files in the wild and they all look different — flat bullet lists, numbered lists, headings by feature, headings by date, mixed prose. Defining a format for `TODO.md` would make every existing one "non-compliant." TASKS.md starts with a clean slate.

**Different mental model.** A "todo list" is a passive wish list for humans. A "task queue" is an active work queue for agents and orchestrators. The name sets the right expectation: this file is read and written by machines, not just skimmed by people.

**Naming convention.** The agent standards family is forming: `AGENTS.md` (instructions), `TASKS.md` (work queue). `TODO.md` doesn't fit this pattern.

**If you already have a TODO.md**, migration is straightforward — rename it, add `P0`–`P3` headings, and convert items to checkboxes:

```bash
mv TODO.md TASKS.md
# Add priority headings and checkbox format per the spec
```

### Do I need an orchestrator?

No. A solo developer with one agent benefits from persistent context across sessions. But the format is designed so orchestrators can also read and write it programmatically.

### Won't deleting tasks cause merge conflicts?

Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. In practice, conflicts are rare and trivial to resolve.

### Can agents add tasks?

Yes. Agents discover work during implementation ("this function needs refactoring," "found a bug in the adjacent module"). They add new tasks to TASKS.md for the next cycle.

## Contributing

Open an issue or PR to:
- Improve the [specification](spec.md)
- Add examples for your stack
- Share how TASKS.md works with your tool

## License

[MIT](LICENSE)

## About

TASKS.md emerged from patterns common across agent orchestrators and multi-agent development workflows. As AI coding agents become more autonomous, the need for a standard, persistent, human-readable task queue becomes clear. TASKS.md fills that gap.

We aim to work with the [AGENTS.md](https://agents.md/) community to establish TASKS.md as a companion convention.
