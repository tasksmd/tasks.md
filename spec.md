# TASKS.md Specification

**Version**: 0.2.0 (Draft)

## Overview

TASKS.md is a standard file format for agent task queues. It is a Markdown file at the root of a repository that an orchestrator — or any coding agent — uses to assign, track, and coordinate work.

TASKS.md is designed for **agent orchestrators**: systems that decompose work into tasks and assign them to coding agents. Examples include [Bosun](https://github.com/fivanishche/bosun), [OpenHands](https://github.com/All-Hands-AI/OpenHands), [Factory Droids](https://factory.ai), GitHub Copilot coding agent, and custom pipelines.

It complements [AGENTS.md](https://agents.md/). AGENTS.md tells agents **how** to work. TASKS.md tells them **what** to work on.

## File

- **Name**: `TASKS.md`
- **Location**: Repository root (next to `README.md` and `AGENTS.md`)
- **Format**: Markdown
- **Encoding**: UTF-8

One file per repository. In monorepos, place one `TASKS.md` at the root. Use the **Files** metadata field to scope tasks to specific packages — not separate files.

## Format

A TASKS.md file has this exact structure:

```markdown
# Tasks

## P0 — Critical

- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1 — Important

- [ ] Add rate limiting to public API endpoints (@cursor-1)
  - **Details**: Use express-rate-limit, 100 req/min per IP for /api/public/*
  - **Blocked by**: "Fix authentication crash on token refresh"

## P2 — Nice to Have

- [ ] Update README with new API endpoints

## P3 — Future

- [ ] Support WebSocket connections
```

### Rules

1. The file MUST start with `# Tasks`
2. Tasks are organized under exactly four headings: `## P0 — Critical`, `## P1 — Important`, `## P2 — Nice to Have`, `## P3 — Future`
3. Empty sections MAY be omitted
4. Each task is a Markdown checkbox: `- [ ]` (pending) or `- [x]` (done)
5. Higher sections = higher priority. First task in a section = most important
6. No other headings, sections, or structure is permitted at the top level

### Tasks

A task is a single checkbox line with an imperative description:

```markdown
- [ ] Fix authentication crash on token refresh
```

### Metadata

Tasks MAY have nested metadata using bold labels. There are exactly four recognized fields:

```markdown
- [ ] Fix authentication crash on token refresh
  - **Details**: JWT refresh returns 500 on expired tokens.
    Catch TokenExpiredError and issue a new token.
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: "Upgrade jsonwebtoken to v10"
```

| Field | Purpose |
|-------|---------|
| **Details** | Implementation guidance |
| **Files** | File paths (backtick-quoted, comma-separated) |
| **Acceptance** | Definition of done |
| **Blocked by** | Quoted description of the blocking task |

All metadata is optional. No other metadata fields are part of the spec.

### Sub-tasks

Tasks MAY have sub-tasks as nested checkboxes:

```markdown
- [ ] Implement user authentication
  - [x] Design auth schema (@cursor-1)
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
```

Sub-tasks inherit priority from their parent.

## Claiming

An agent claims a task by appending its identifier in parentheses:

```markdown
- [ ] Add rate limiting to API (@cascade-1)
```

### Rules

- An agent MUST claim a task before starting work
- Other agents MUST skip claimed tasks
- The claim is part of the task line, not metadata
- On completion: `- [x] Add rate limiting to API (@cascade-1)`

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

Claiming is **best-effort, not a distributed lock**:

- **Race conditions**: Two agents can claim the same task if they read simultaneously. Mitigation: `git pull` before claiming, commit only TASKS.md (`git commit --only TASKS.md`).
- **Stale claims**: A crashed agent's claim stays. Mitigation: define a stale claim policy in AGENTS.md (e.g., "reclaim if no commit from the agent in 30 minutes").

For stronger guarantees, use an MCP server as the coordination backend.

## Completion

When a task is done, the agent removes it from the file entirely:

```markdown
# Before
- [ ] Fix authentication crash (@cursor-1)
- [ ] Add rate limiting

# After
- [ ] Add rate limiting
```

The completed task, its metadata, and its sub-tasks are all removed. History lives in git log.

### Commit Protocol

Agents MUST commit TASKS.md changes separately from code changes, and pull before committing:

```
git pull --rebase
git add TASKS.md
git commit -m "tasks: complete 'Fix authentication crash'"
```

### Why This Is Safe

The claiming protocol guarantees each agent works on a **different task**, which means a **different line**. Git auto-merges changes to non-adjacent lines. Two agents completing two different tasks will never conflict — they're deleting different lines in different parts of the file.

The only edge case is two agents completing **adjacent** tasks simultaneously, which can produce a trivial merge conflict. This is rare in practice and easy to resolve.

## Blockers

A task with `**Blocked by**` MUST NOT be started until the blocking task is gone from the file (i.e., completed and removed):

```markdown
- [ ] Deploy to production
  - **Blocked by**: "Fix authentication crash on token refresh"
```

Agents SHOULD:
1. Prioritize tasks that block other work — unblocking has the highest impact
2. Skip blocked tasks when selecting work
3. Remove the `**Blocked by**` line when the blocking task is no longer in the file

## Agent Discovery

### When to Read

Agents SHOULD read TASKS.md:
- **On session start** — before asking the user what to work on
- **After completing a task** — to find the next item
- **When the user says "work on the next task"** or similar

### When to Write

Agents SHOULD update TASKS.md:
- **Before starting work** — claim the task
- **After completing work** — mark `[x]`
- **When discovering new work** — add tasks found during implementation

### When TASKS.md Is Empty or Missing

Not an error. The agent asks the user for instructions.

### AGENTS.md Integration

Teams SHOULD add this to their AGENTS.md:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
```

## Orchestrator Integration

TASKS.md is designed as the interface between an orchestrator and its agents:

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

This loop works whether the orchestrator is a background server, a CI pipeline, or a human running agents manually.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | AGENTS.md = how to work. TASKS.md = what to work on. |
| [MCP](https://modelcontextprotocol.io/) | An MCP server can provide read/write access to TASKS.md. |
| GitHub Issues / Jira | Issues track features for teams. TASKS.md tracks implementation steps for agents. They complement each other — a single Issue may produce multiple TASKS.md entries. |

## Versioning

This specification follows [Semantic Versioning](https://semver.org/). The current version is **0.2.0** (draft).
