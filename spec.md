# TASKS.md Specification

**Version**: 0.5.0 (Draft)

## Overview

TASKS.md is a lightweight specification for agent task queues. A Markdown file that orchestrators and coding agents use to track and coordinate work in a repository.

It complements [AGENTS.md](https://agents.md/). AGENTS.md tells agents **how** to work. TASKS.md tells them **what** to work on.

## Design Principles

1. **Markdown first** — Human-readable, git-friendly, zero tooling required
2. **Lightweight spec** — Enough structure for tools to parse reliably, enough flexibility for humans to write naturally. LLMs read Markdown natively, so the format doesn't need to be machine-strict.
3. **Scales up** — Single file for small repos, directory-scoped files for large ones
4. **Opinionated defaults** — One recommended way to do things, but teams can adapt

## File

- **Name**: `TASKS.md`
- **Location**: Repository root, next to `README.md` and `AGENTS.md`
- **Encoding**: UTF-8

### Multiple Files

Small repos use one `TASKS.md` at the root. Large repos and monorepos can add `TASKS.md` files in subdirectories to scope work by package or team:

```
my-project/
├── TASKS.md             # project-wide tasks
├── packages/
│   ├── api/
│   │   └── TASKS.md     # API-specific tasks
│   └── web/
│       └── TASKS.md     # web-specific tasks
```

Discovery algorithm:
1. Walk up from the agent's working directory to find the nearest `TASKS.md`
2. Also read the root `TASKS.md` if it's a different file
3. Consider tasks from all applicable files together, prioritized by P-level regardless of which file they're in

Task IDs should be unique across all `TASKS.md` files in the repo so blocker references are unambiguous.

**When to split**: Consider separate files when a single TASKS.md exceeds ~50 tasks, or when teams working in different packages rarely overlap on tasks.

## Format

```markdown
# Tasks

**Spec**: v0.5

## P0

- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints (@cursor-1)
  - **ID**: rate-limit
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: auth-fix

## P2

- [ ] Update README with new API endpoints

## P3

- [ ] Support WebSocket connections
```

### Version

The spec version is declared as a metadata line under the heading:

```markdown
# Tasks

**Spec**: v0.5
```

This is visible when rendered and tells both humans and tools which format to expect. If omitted, the latest version is assumed.

### Priority Sections

Tasks are organized under four priority headings — `## P0` through `## P3`:

| Heading | When to use |
|---------|-------------|
| `## P0` | System is broken or users are blocked. Drop everything. |
| `## P1` | Core work that should ship. Default for planned features and important bugs. |
| `## P2` | Valuable but not blocking. Do after P0 and P1 are clear. |
| `## P3` | Someday. Kept for reference, not actively worked. |

P0–P3 is the [industry-standard severity scale](https://en.wikipedia.org/wiki/Severity_(engineering)) used by PagerDuty, Google SRE, and most incident management systems. We adopt it directly rather than inventing a new scheme.

Empty sections can be omitted. Higher sections = higher priority. First task in a section = most important within that priority.

### Tasks

A task is a Markdown checkbox with a short imperative description:

```markdown
- [ ] Fix authentication crash on token refresh
```

Tasks should be completable in a single agent session — typically a focused unit of work like fixing a bug, adding an endpoint, or refactoring a module. If a task is too large, break it into sub-tasks or multiple top-level tasks.

### Task IDs

Tasks that are referenced as blockers or need cross-file linking should have an **ID** metadata field:

```markdown
- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
```

IDs are short, kebab-case, and stable — they should not change once assigned. IDs should be unique across all `TASKS.md` files in the repository.

Tasks with no blockers or cross-references don't need an ID. A bare `- [ ] Fix the typo` is valid.

### Metadata

Tasks can have nested metadata using bold labels:

```markdown
- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Details**: JWT refresh returns 500 on expired tokens.
    Catch TokenExpiredError and issue a new token.
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: jwt-upgrade
```

| Field | Purpose |
|-------|---------|
| **ID** | Stable identifier for blocker references and cross-file linking |
| **Details** | Implementation guidance, context, approach |
| **Files** | Relevant file paths (backtick-quoted, comma-separated) |
| **Acceptance** | Definition of done |
| **Blocked by** | Task ID(s) of blocking tasks — comma-separated if multiple |

All metadata is optional. A bare `- [ ] Fix the typo` is a valid task.

### Blockers

Blockers reference tasks by their **ID**:

```markdown
- [ ] Deploy to production
  - **Blocked by**: auth-fix, rate-limit
```

A blocked task should not be started until every referenced ID has been removed from the file (i.e., completed). Agents should:
1. Skip blocked tasks when selecting work
2. Prioritize tasks that block other work — unblocking has the highest impact
3. Remove the **Blocked by** line (or individual IDs) when the blocking task is gone

### Sub-tasks

Tasks can have sub-tasks as nested checkboxes:

```markdown
- [ ] Implement user authentication
  - [x] Design auth schema
  - [ ] Set up JWT token generation
  - [ ] Add login endpoint
```

Rules:
- Sub-tasks marked `[x]` stay in the file — they track progress on the parent
- When the parent task is fully complete (all sub-tasks done), the entire block is removed: parent, sub-tasks, and metadata together
- Sub-tasks inherit priority from their parent
- The agent who claims the parent owns all its sub-tasks. Other agents should not claim individual sub-tasks of a claimed parent. For parallel work, promote sub-tasks to top-level tasks with blocker relationships instead.

## Claiming

An agent claims a task by appending its name in parentheses on the task line:

```markdown
- [ ] Add rate limiting to public API endpoints (@cursor-1)
```

Other agents should skip claimed tasks. On completion, the agent removes the entire task block from the file.

### Agent Identity

The recommended format is `@<tool>-<instance>`:

| Example | Meaning |
|---------|---------|
| `@cursor-1` | Cursor, window 1 |
| `@claude-code` | Claude Code CLI |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@cascade-bg` | Windsurf Cascade, background |
| `@pipeline-a1b2` | Orchestrator pipeline |

Teams can define their own identity convention in AGENTS.md. The key requirement is that identifiers distinguish concurrent instances of the same tool.

### Limitations

Claiming is best-effort, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice this is rare — agents work on different timescales and the claim window is small. For stronger guarantees, use an MCP server as the coordination backend.

Stale claims from crashed agents should be handled per team convention (e.g., "reclaim tasks with no activity for 30 minutes"). Document this in your AGENTS.md.

## Completion

When a task is done, the agent removes it from the file — the task line, its metadata, and all its sub-tasks. The entire block is removed as a unit. Completed task history lives in git log.

This keeps the file focused on pending work. Each agent works on a different task (via claiming), so removals target different lines and merge cleanly.

## Agent Behavior

### Reading Tasks

Agents should read TASKS.md:
- **On session start** — before asking the user what to work on
- **After completing a task** — to pick up the next item
- **When asked to "work on the next task"** or similar

A missing or empty TASKS.md is not an error. The agent asks the user for instructions.

### Writing Tasks

In multi-agent setups, the **orchestrator should be the sole writer** of new tasks. This avoids merge conflicts from multiple agents appending to the same section simultaneously.

When a single agent works alone, it can freely add tasks it discovers during implementation ("this function needs refactoring," "found a bug in the adjacent module").

Agents should claim and remove tasks regardless of setup — only *adding* new tasks needs coordination.

### Disagreements

An agent may encounter a task it believes is misprioritized, too vague, or should be split. Agents should **not** silently reprioritize or restructure tasks. Instead:

- **Flag it**: Add a note to the task's **Details** explaining the concern
- **Ask**: If a human is in the loop, surface the issue before proceeding
- **Defer**: If an orchestrator manages the file, leave reprioritization to it

The orchestrator or human is the authority on priority and scope. Agents execute.

### AGENTS.md Integration

Reference TASKS.md from your AGENTS.md:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-name) before starting work
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
2. **Agent** reads TASKS.md, claims a task, implements it, removes it when done
3. **Orchestrator** monitors the file, resolves blockers, adds follow-up tasks

This works whether the orchestrator is a server, a CI pipeline, or a human running agents from chat.

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
| 0.5.0 | Draft | Task IDs as metadata field, spec version as metadata line, sub-task ownership, task granularity, concurrent write guidance, agent disagreement protocol |
| 0.4.0 | Superseded | Task names as identifiers, SHOULD-based language |
| 0.3.0 | Superseded | Inline task IDs, multi-file support, simplified priority headings |
| 0.2.0 | Superseded | Orchestrator-first framing, strict format |
| 0.1.0 | Superseded | Initial draft |

Breaking changes increment the minor version during 0.x development.
