# TASKS.md Specification

**Version**: 0.1.0 (Draft)

## Overview

TASKS.md is a Markdown file placed at the root of a repository that contains a prioritized list of work for coding agents. It complements [AGENTS.md](https://agents.md/) — while AGENTS.md provides agent instructions, TASKS.md provides agent work items.

## File Location

The file MUST be named `TASKS.md` and placed at the repository root, alongside `README.md` and `AGENTS.md`.

In monorepos, additional `TASKS.md` files MAY be placed in package directories. Agents should read the most specific file for the directory they are working in, falling back to the root file.

```
my-project/
├── AGENTS.md          # Agent instructions
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
1. A top-level heading (`# Tasks` recommended but not required)
2. Priority sections as level-2 headings
3. Tasks as Markdown checkbox list items

### Priority Sections

Tasks are organized into priority sections using level-2 headings. The recommended tiers are:

| Section | Meaning |
|---------|---------|
| `## P0 — Critical` | Broken / blocking — must fix immediately |
| `## P1 — Important` | Core features and fixes |
| `## P2 — Nice to Have` | Polish, docs, minor improvements |
| `## P3 — Future` | Long-term, aspirational |

The section labels are customizable. All of these are valid:

```markdown
## P0 — Critical
## 🔥 Urgent
## Backlog
## Sprint 12
```

The only requirement is that **higher sections in the file = higher priority**. Agents read top-to-bottom and should work on the first unclaimed, unblocked task they find.

### Task Format

A task is a Markdown checkbox list item:

```markdown
- [ ] Short description of the task
```

A completed task uses a checked checkbox:

```markdown
- [x] Short description of the task (@agent-name)
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

Supported metadata fields:

| Field | Purpose |
|-------|---------|
| **Details** | Implementation guidance, context, approach |
| **Files** | Relevant file paths (scope hint) |
| **Acceptance** | Definition of done |
| **Blocked by** | Name of blocking task (must be resolved first) |

All metadata fields are optional. A task with just a description is valid.

### Sub-tasks

Tasks MAY have sub-tasks using nested checkboxes:

```markdown
- [ ] Implement user authentication
  - [x] Design auth schema (@cursor-1)
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
  - [ ] Add token refresh endpoint
```

Sub-tasks inherit priority from their parent. A parent task is considered complete when all sub-tasks are checked.

### Agent Claiming

In multi-agent environments, an agent claims a task by appending its identifier:

```markdown
- [ ] Add rate limiting to API (@cascade-1 — in progress)
```

Conventions:
- An agent MUST claim a task before starting work
- Other agents MUST NOT pick up claimed tasks
- On completion, the agent marks `[x]` and keeps attribution: `- [x] Task (@cascade-1)`
- If an agent abandons work, it SHOULD remove its claim

### Blocker Protocol

A task with a `**Blocked by**` field cannot be started until the referenced task is completed:

```markdown
- [ ] Deploy to production
  - **Blocked by**: "Fix authentication crash on token refresh"
```

Agents SHOULD:
1. Scan for tasks that block other work and prioritize those
2. Skip blocked tasks when selecting work
3. Remove the `**Blocked by**` line when the blocker is resolved

## Lifecycle

### Adding Tasks

Tasks are added by humans or agents. Agents MAY add tasks they discover during work (e.g., a bug found while implementing a feature).

### Completing Tasks

When a task is done:
1. Mark it `[x]` with attribution
2. Remove it from the file (completed history lives in git log)

Removing completed tasks keeps the file small and focused on pending work. Teams that prefer in-file history MAY keep a `## Done` section at the bottom, but this is not recommended for large projects.

### Ordering

Within a priority section, tasks are ordered by importance (most important first). Agents should work on the first unclaimed, unblocked task in the highest priority section.

## Structured Alternative: YAML

For teams with automated task processing (orchestrators, CI pipelines, queue processors), a YAML format is recognized as an equivalent:

**Filename**: `tasks-queue.yaml` at the repository root.

```yaml
- task: "Fix authentication crash on token refresh"
  priority: P0
  blocked_by: []
  details: |
    The JWT refresh endpoint returns 500 when the token is expired.
  files:
    - src/auth/refresh.ts
    - src/middleware/auth.ts
  acceptance: |
    Token refresh works, existing tests pass, new regression test added
```

Tools that read `TASKS.md` SHOULD also check for `tasks-queue.yaml`. If both exist, `TASKS.md` is authoritative.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | TASKS.md complements it. AGENTS.md says how; TASKS.md says what. |
| [Agent Skills](https://agentskills.io/) | Skills provide procedural knowledge. TASKS.md assigns work. |
| [MCP](https://modelcontextprotocol.io/) | MCP servers can read/write TASKS.md as a tool. |
| GitHub Issues / Jira | TASKS.md is a lightweight, in-repo alternative for agent-driven work. Tasks MAY reference issue numbers. |

## AGENTS.md Integration

Teams SHOULD reference TASKS.md from their AGENTS.md:

```markdown
# AGENTS.md

## Task Management
- Check TASKS.md for available work before asking the user
- Claim tasks before starting work
- Remove completed tasks (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Versioning

This specification follows [Semantic Versioning](https://semver.org/). The current version is **0.1.0** (draft, seeking community feedback).
