# TASKS.md Specification

**Version**: 0.3.0 (Draft)

## Overview

TASKS.md is a convention for agent task queues. It is a Markdown file that orchestrators and coding agents use to assign, track, and coordinate work in a repository.

It complements [AGENTS.md](https://agents.md/). AGENTS.md tells agents **how** to work. TASKS.md tells them **what** to work on.

## Design Principles

1. **Markdown first** — Human-readable, git-friendly, zero tooling required
2. **Convention, not protocol** — Agents parse by understanding, not by regex. Like AGENTS.md, this works because LLMs read Markdown natively.
3. **Scales from one task to hundreds** — Single file for small repos, directory-scoped files for large ones
4. **Stable references** — Tasks have IDs so blockers and cross-references don't break when descriptions change

## File

- **Name**: `TASKS.md`
- **Location**: Repository root, next to `README.md` and `AGENTS.md`
- **Encoding**: UTF-8

### Multiple Files

In large repositories and monorepos, additional `TASKS.md` files MAY be placed in subdirectories to scope work:

```
my-project/
├── AGENTS.md
├── TASKS.md             # project-wide tasks
├── packages/
│   ├── api/
│   │   └── TASKS.md     # API-specific tasks
│   └── web/
│       └── TASKS.md     # web-specific tasks
```

When multiple files exist:
- An agent working in a subdirectory reads the **most specific** `TASKS.md` for that directory, then falls back to the root file
- Task IDs (see [Task IDs](#task-ids)) MUST be unique across all `TASKS.md` files in a repository
- The root `TASKS.md` MAY reference tasks in subdirectory files using their IDs

### In-File Version

Files SHOULD declare which spec version they follow using an HTML comment on the first line:

```markdown
<!-- tasks-spec: 0.3 -->
# Tasks
```

This allows tools to handle format changes across spec versions. If omitted, the latest version is assumed.

## Format

```markdown
<!-- tasks-spec: 0.3 -->
# Tasks

## P0

- [ ] Fix authentication crash on token refresh `#auth-fix`
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints `#rate-limit` (@cursor-1)
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: `#auth-fix`

## P2

- [ ] Update README with new API endpoints `#update-docs`

## P3

- [ ] Support WebSocket connections `#websocket`
```

### Priority Sections

Tasks are organized under four priority headings:

| Heading | When to use | Examples |
|---------|-------------|---------|
| `## P0` | System is broken or users are blocked. Drop everything. | Production crash, data loss, security vulnerability |
| `## P1` | Core work that must ship. The default for planned features and important bugs. | Feature implementation, significant bugs, tech debt blocking progress |
| `## P2` | Valuable but not blocking. Do after P0 and P1 are clear. | Polish, docs, minor improvements, non-critical refactors |
| `## P3` | Someday. Kept for reference, not actively worked. | Long-term ideas, speculative features, "would be nice" items |

**Why four levels**: Fewer than four (e.g., High/Medium/Low) conflates "system is down" with "important feature." More than four creates ambiguity — people can't consistently distinguish five priority levels. Four maps cleanly to incident severity (P0–P3) which is already an industry standard.

Rules:
- The heading MUST be exactly `## P0`, `## P1`, `## P2`, or `## P3` (no suffix required)
- Empty sections MAY be omitted
- Higher sections = higher priority
- First task in a section = most important within that priority

### Tasks

A task is a Markdown checkbox with an imperative description:

```markdown
- [ ] Fix authentication crash on token refresh `#auth-fix`
```

### Task IDs

Tasks SHOULD have a short, stable identifier in backticks at the end of the task line:

```markdown
- [ ] Fix authentication crash `#auth-fix`
- [ ] Add rate limiting `#rate-limit`
```

Rules:
- Format: `` `#<kebab-case-id>` ``
- IDs MUST be unique within a repository (across all TASKS.md files)
- IDs MUST NOT change once assigned — they are stable references
- IDs are used for blocker references and cross-file linking

IDs are optional for simple tasks with no blockers or cross-references. A bare `- [ ] Fix the typo` is valid.

### Metadata

Tasks MAY have nested metadata using bold labels:

```markdown
- [ ] Fix authentication crash `#auth-fix`
  - **Details**: JWT refresh returns 500 on expired tokens.
    Catch TokenExpiredError and issue a new token.
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: `#jwt-upgrade`
```

| Field | Purpose |
|-------|---------|
| **Details** | Implementation guidance, context, approach |
| **Files** | Relevant file paths (backtick-quoted, comma-separated) |
| **Acceptance** | Definition of done |
| **Blocked by** | Task ID(s) of blocking tasks — comma-separated if multiple |

All metadata is optional.

### Sub-tasks

Tasks MAY have sub-tasks as nested checkboxes:

```markdown
- [ ] Implement user authentication `#auth`
  - [x] Design auth schema (@cursor-1)
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
```

Sub-tasks inherit priority from their parent. Sub-tasks do not need IDs unless they are referenced as blockers.

## Claiming

An agent claims a task by appending its identifier in parentheses on the task line:

```markdown
- [ ] Add rate limiting `#rate-limit` (@cascade-1)
```

Rules:
- An agent MUST claim a task before starting work
- Other agents MUST skip claimed tasks
- On completion, the agent removes the task from the file

### Agent Identity

Format: `@<tool>-<instance>`

| Example | Meaning |
|---------|---------|
| `@cursor-1` | Cursor, window 1 |
| `@claude-code` | Claude Code CLI |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@cascade-bg` | Windsurf Cascade, background |
| `@pipeline-a1b2` | Orchestrator pipeline |

The identifier MUST be specific enough to distinguish concurrent instances of the same tool.

### Limitations

Claiming is best-effort, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice this is rare. For stronger guarantees, use an MCP server as the coordination backend with TASKS.md as the human-readable view.

Stale claims from crashed agents should be documented in your AGENTS.md (e.g., "reclaim tasks with no activity for 30 minutes").

## Blockers

A task with `**Blocked by**` MUST NOT be started until every referenced task ID has been removed from the file (i.e., completed):

```markdown
- [ ] Deploy to production `#deploy`
  - **Blocked by**: `#auth-fix`, `#rate-limit`
```

The blocker uses **task IDs**, not descriptions. This means:
- Blockers don't break when task descriptions are edited
- Blockers work across TASKS.md files in a monorepo
- An agent can mechanically check if a blocker is resolved: search all TASKS.md files for the ID

Agents SHOULD:
1. Prioritize tasks that block other work — unblocking has the highest impact
2. Skip blocked tasks when selecting work
3. Remove the `**Blocked by**` line (or individual IDs) when the blocking task is gone

## Completion

When a task is done, the agent removes it from the file — the task line, its metadata, and its sub-tasks. Completed task history lives in git log.

This keeps the file focused on pending work and prevents unbounded growth. Each agent works on a different task (guaranteed by claiming), so removals target different lines and merge cleanly.

## Agent Discovery

Agents SHOULD read TASKS.md:
- **On session start** — before asking the user what to work on
- **After completing a task** — to pick up the next item
- **When asked to "work on the next task"** or similar

Agents SHOULD write TASKS.md:
- **Before starting work** — claim the task
- **After completing work** — remove the task
- **When discovering new work** — add tasks found during implementation

A missing or empty TASKS.md is not an error. The agent asks the user for instructions.

### AGENTS.md Integration

Teams SHOULD reference TASKS.md from their AGENTS.md:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Orchestrator Integration

TASKS.md serves as the interface between an orchestrator and its agents:

```
┌─────────────┐     writes      ┌──────────┐     reads      ┌─────────┐
│ Orchestrator │ ──────────────> │ TASKS.md │ <────────────── │  Agent  │
│  (planner)   │                 │          │ ──────────────> │ (coder) │
└─────────────┘     reads       └──────────┘     writes      └─────────┘
                  completions                   claims/removes
```

1. **Orchestrator** decomposes work into tasks and writes TASKS.md
2. **Agent** reads TASKS.md, claims a task, implements it, removes the task when done
3. **Orchestrator** monitors the file, resolves blockers, adds follow-up tasks

This works whether the orchestrator is a background server, a CI pipeline, or a human running agents from chat.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | AGENTS.md = how to work. TASKS.md = what to work on. |
| [MCP](https://modelcontextprotocol.io/) | An MCP server can provide read/write access to TASKS.md. |
| GitHub Issues / Jira | Issues track features for teams. TASKS.md tracks implementation steps for agents. A single Issue may produce multiple TASKS.md entries. |

## Spec Versioning

This specification follows [Semantic Versioning](https://semver.org/).

| Version | Status | Changes |
|---------|--------|---------|
| 0.3.0 | Draft | Task IDs, multi-file support, in-file versioning, simplified priority headings |
| 0.2.0 | Superseded | Orchestrator-first framing, strict format |
| 0.1.0 | Superseded | Initial draft |

Breaking changes increment the minor version during 0.x development. Files declare their version via `<!-- tasks-spec: 0.3 -->` so tools can handle migrations.
