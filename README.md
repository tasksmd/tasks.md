# TASKS.md

A simple, open format for giving coding agents a task queue.

Think of TASKS.md as a **backlog for agents**: a persistent, version-controlled, human-readable list of work that any agent can read, claim, and complete.

**TASKS.md is a companion to [AGENTS.md](https://agents.md/).** While AGENTS.md tells agents *how* to work, TASKS.md tells them *what* to work on.

## Why TASKS.md?

AI coding agents are increasingly autonomous — they research, plan, implement, test, and open PRs. But there is no standard way to give them a queue of work.

Today's landscape is fragmented:

- **Ad-hoc chat** — "Add auth to the API" → lost after the session ends
- **TODO comments** — `// TODO: fix this` → scattered, no priority, no claiming
- **Issue trackers** — GitHub Issues, Jira → requires API access, not in the repo
- **Custom files** — Every team invents their own format

TASKS.md provides a single, predictable place for task management — just like AGENTS.md did for agent instructions.

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

That's it. Your agents now have a backlog.

## Format

### Required

| Element | Format | Purpose |
|---------|--------|---------|
| **Task** | `- [ ] Description` | Markdown checkbox — universal, diff-friendly |
| **Priority** | `## P0` through `## P3` | Section headers define priority tiers |

### Optional

| Element | Format | Purpose |
|---------|--------|---------|
| **Details** | `- **Details**: ...` | Implementation guidance |
| **Files** | `- **Files**: \`path\`` | Scope hint for the agent |
| **Acceptance** | `- **Acceptance**: ...` | Definition of done |
| **Blocked by** | `- **Blocked by**: "task"` | Dependency tracking |
| **Claimed by** | `(@name — in progress)` | Multi-agent coordination |

### Conventions

1. **Completed tasks are removed** — History lives in git log. TASKS.md only contains pending work.

2. **Priority tiers are customizable** — `P0`–`P3` is a recommendation. Teams can use `## Critical`, `## Backlog`, etc. Higher sections = higher priority.

3. **Claiming prevents conflicts** — In multi-agent environments, append `(@agent-name — in progress)` to claim a task. Other agents must skip claimed tasks.

4. **Blockers are first-class** — Agents should prioritize unblocking work. A task with `**Blocked by**` cannot be started until the blocker is resolved.

5. **Sub-tasks use indentation**:
   ```markdown
   - [ ] Implement user authentication
     - [ ] Set up JWT token generation
     - [ ] Add login endpoint
     - [x] Design auth schema (@cursor-1)
   ```

See the [full specification](spec.md) for details.

## Multi-Agent Coordination

TASKS.md solves a problem that simple TODO lists don't address: **multiple agents working in the same repo**.

```markdown
## P1 — Important

- [ ] Add rate limiting to API (@cascade-1 — in progress)
- [ ] Migrate to prepared SQL statements
- [x] Fix CORS headers (@claude-code)
```

The protocol:
1. **Read** TASKS.md to find unclaimed work
2. **Claim** by appending your agent name
3. **Work** on the task
4. **Complete** by marking `[x]` with attribution
5. **Cleanup** — remove completed tasks (history is in git)

## AGENTS.md Integration

Reference TASKS.md from your AGENTS.md:

```markdown
# AGENTS.md

## Task Management
- Check TASKS.md for available work before asking the user
- Claim tasks before starting work
- Remove completed tasks (history is in git log)
- Prioritize tasks that unblock other work
```

## One TASKS.md Works Across Many Agents

TASKS.md uses plain Markdown checkboxes — the most universal format. Any agent that reads Markdown can read TASKS.md:

- GitHub Copilot coding agent
- OpenAI Codex
- Cursor
- Claude Code
- Windsurf
- Augment
- Any future agent

No special parser, MCP server, or tooling required.

## Structured Alternative: YAML

For teams with automated task processing (orchestrators, CI pipelines, MCP servers), a YAML format works too:

```yaml
- task: "Fix authentication crash on token refresh"
  priority: P0
  blocked_by: []
  details: |
    JWT refresh endpoint returns 500 when token is expired.
    Files: src/auth/refresh.ts, src/middleware/auth.ts
  acceptance: |
    Token refresh works, existing tests pass, new regression test added
```

Tools that read `TASKS.md` should also check for `tasks-queue.yaml` as a structured equivalent.

## Examples

See the [examples/](examples/) directory for TASKS.md files across different project types:
- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)

## Contributing

We welcome contributions! Open an issue or PR to:
- Improve the specification
- Add examples for your stack
- Propose extensions for specific use cases
- Report how TASKS.md works (or doesn't) with your agent

## License

[MIT](LICENSE)

## About

TASKS.md emerged from real-world multi-agent development workflows. When you have multiple AI agents (Cursor, Claude Code, Windsurf, orchestrator pipelines) working in the same repository simultaneously, you need a coordination layer. TASKS.md is that layer.

We aim to work with the [AGENTS.md](https://agents.md/) community and the [Agentic AI Foundation](https://openai.com/index/agentic-ai-foundation/) to establish TASKS.md as a companion standard.
