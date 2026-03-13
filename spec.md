# TASKS.md Specification

**Version**: 0.1.0 (Draft)

## Overview

TASKS.md is a Markdown file at the root of a repository that gives coding agents a persistent, prioritized backlog. It complements [AGENTS.md](https://agents.md/) — AGENTS.md provides instructions, TASKS.md provides work items.

The primary use case is **session persistence**: work survives across agent sessions, tool switches, and restarts. The advanced use case is **multi-agent coordination**: multiple agents can read, claim, and complete tasks without conflicts.

## File Location

The file MUST be named `TASKS.md` and placed at the repository root, alongside `README.md` and `AGENTS.md`.

In monorepos, additional `TASKS.md` files MAY be placed in package directories. Agents read the most specific file for the directory they are working in, falling back to the root file.

```
my-project/
├── AGENTS.md
├── TASKS.md           # Project-wide tasks
├── README.md
├── packages/
│   ├── api/
│   │   └── TASKS.md   # API-specific tasks
│   └── web/
│       └── TASKS.md   # Web-specific tasks
```

## Format

### Structure

A TASKS.md file consists of:
1. A top-level heading (`# Tasks`)
2. Priority sections as level-2 headings (`## P0`, `## P1`, etc.)
3. Tasks as Markdown checkbox list items (`- [ ]`)

### Priority Sections

Tasks are organized into exactly four priority tiers:

| Section | Meaning |
|---------|---------|
| `## P0 — Critical` | Broken or blocking — must fix immediately |
| `## P1 — Important` | Core features and fixes |
| `## P2 — Nice to Have` | Polish, docs, minor improvements |
| `## P3 — Future` | Long-term, aspirational |

Empty sections MAY be omitted. The `P0`–`P3` labels are the canonical format. Agents MUST understand these labels and SHOULD treat them as ordered: P0 > P1 > P2 > P3.

Within a section, tasks are ordered by importance — first task is most important. Agents work top-to-bottom: pick the first unclaimed, unblocked task in the highest non-empty priority section.

### Task Format

A task is a Markdown checkbox list item with a short, imperative description:

```markdown
- [ ] Fix authentication crash on token refresh
```

A completed task:

```markdown
- [x] Fix authentication crash on token refresh (@cursor-1)
```

### Task Metadata

Tasks MAY include structured metadata as nested bold-label items:

```markdown
- [ ] Fix authentication crash on token refresh
  - **Details**: The JWT refresh endpoint returns 500 when the token has expired.
    Need to catch the TokenExpiredError and issue a new token.
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Token refresh works, existing tests pass, new regression test added
  - **Blocked by**: "Upgrade jsonwebtoken to v10"
```

| Field | Format | Purpose |
|-------|--------|---------|
| **Details** | Free text | Implementation guidance, context, approach |
| **Files** | Backtick-quoted paths, comma-separated | Scope hint for the agent |
| **Acceptance** | Free text | Definition of done |
| **Blocked by** | Quoted task description | Dependency — cannot start until blocker is resolved |

All metadata fields are optional. A bare `- [ ] Fix the bug` is a valid task.

### Sub-tasks

Tasks MAY have sub-tasks using nested checkboxes:

```markdown
- [ ] Implement user authentication
  - [x] Design auth schema (@cursor-1)
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
  - [ ] Add token refresh endpoint
```

Sub-tasks inherit priority from their parent.

## Agent Discovery

How agents find and interact with TASKS.md:

### When to Read

Agents SHOULD check TASKS.md:
- **On session start** — before asking the user what to work on
- **After completing a task** — to find the next item
- **When idle** — if the user hasn't given explicit instructions

### When to Write

Agents SHOULD update TASKS.md:
- **Before starting work** — claim the task (multi-agent only)
- **After completing work** — mark the task done
- **When discovering new work** — add tasks found during implementation

### When TASKS.md Is Empty or Missing

- **Missing file**: Agent works normally — asks the user for instructions
- **Empty file**: Agent asks the user what to work on, or looks for other signals (failing tests, open PRs, TODO comments)

An empty or missing TASKS.md is not an error.

### AGENTS.md Integration

Until tool vendors add native TASKS.md support, teams SHOULD reference it from AGENTS.md:

```markdown
# AGENTS.md

## Task Management
- Check TASKS.md for available work before asking the user
- Claim tasks before starting work
- Remove completed tasks (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Multi-Agent Coordination

When multiple agents work in the same repository, TASKS.md provides a best-effort coordination protocol.

### Claiming

An agent claims a task by appending its identifier and committing the change:

```markdown
- [ ] Add rate limiting to API (@cascade-1 — in progress)
```

Rules:
- An agent MUST claim a task before starting work on it
- Other agents MUST NOT pick up claimed tasks
- On completion, the agent marks `[x]` and keeps attribution
- On abandonment, the agent SHOULD remove its claim

### Agent Identity

The claim format is `(@<tool>-<instance>)`. Examples:

| Claim | Meaning |
|-------|---------|
| `@cursor-1` | Cursor, first window |
| `@claude-code` | Claude Code CLI |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@cascade-bg` | Windsurf Cascade, background session |
| `@pipeline-a1b2` | Automated pipeline with ID |

The identifier should be specific enough that a human can tell which agent instance claimed the task. Tool name alone is insufficient if multiple instances run concurrently.

### Blocker Protocol

A task with `**Blocked by**` cannot be started until the referenced task is completed:

```markdown
- [ ] Deploy to production
  - **Blocked by**: "Fix authentication crash on token refresh"
```

Agents SHOULD:
1. Scan for tasks that block other work and prioritize those — unblocking has the highest impact
2. Skip blocked tasks when selecting work
3. Remove the `**Blocked by**` line when the blocker is resolved

### Limitations and Mitigations

The claiming protocol is **best-effort, not a distributed lock**. Known limitations:

| Limitation | Mitigation |
|------------|-----------|
| **Race conditions** — Two agents can claim the same task simultaneously | Agents should `git pull` before claiming, and use `git commit --only TASKS.md` to minimize the conflict window. In practice, races are rare. |
| **Stale claims** — A crashed agent leaves its claim forever | Teams should define a stale claim policy in AGENTS.md (e.g., "reclaim after 1 hour of inactivity"). The spec intentionally does not define a timeout — it varies by team. |
| **Merge conflicts** — Simultaneous edits to TASKS.md | Agents should commit TASKS.md changes separately from code changes. Markdown checkbox diffs are simple to resolve. |

For stronger coordination guarantees, use an MCP server as the coordination backend and TASKS.md as the human-readable view.

## Lifecycle

### Adding Tasks

Tasks are added by humans or agents. Agents MAY add tasks they discover during work (e.g., a bug found while implementing a feature, a refactoring opportunity, a missing test).

### Completing Tasks

When a task is done:
1. Mark it `[x]` with attribution: `- [x] Task description (@agent-name)`
2. Remove it from the file

Completed task history lives in git log. Removing done tasks keeps the file focused on pending work.

Teams that prefer in-file history MAY keep a `## Done` section at the bottom, but this is not recommended for active projects — the file grows without bound.

### Ordering

Within a priority section, tasks are ordered by importance (most important first). When reordering, prefer moving tasks up rather than down — the top of each section is the "next up" position.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | Complementary. AGENTS.md = how. TASKS.md = what. |
| [MCP](https://modelcontextprotocol.io/) | MCP servers can provide read/write access to TASKS.md as a tool. |
| GitHub Issues / Jira | TASKS.md is not a replacement. Issues track features and bugs for teams. TASKS.md tracks implementation steps for agents. A GitHub Issue might say "Add auth." TASKS.md breaks that into steps. Tasks MAY reference issue numbers. |

## Extensions

The following extensions are not part of the core spec but are recognized patterns for teams with specific needs.

### YAML Format (tasks-queue.yaml)

For automated task processing (orchestrators, CI pipelines, queue processors), a YAML format provides machine-readable structure:

```yaml
- task: "Fix authentication crash on token refresh"
  priority: P0
  blocked_by: []
  claimed_by: null
  details: |
    The JWT refresh endpoint returns 500 when the token is expired.
  files:
    - src/auth/refresh.ts
    - src/middleware/auth.ts
  acceptance: |
    Token refresh works, existing tests pass, new regression test added
```

If both `TASKS.md` and `tasks-queue.yaml` exist, `TASKS.md` is authoritative.

### Labels / Tags

Tasks MAY include inline tags for filtering:

```markdown
- [ ] Fix CORS headers #security #api
- [ ] Update dependencies #chore
```

The spec does not define a tag taxonomy. Tags are freeform and team-specific.

## Versioning

This specification follows [Semantic Versioning](https://semver.org/). The current version is **0.1.0** (draft, seeking community feedback).
