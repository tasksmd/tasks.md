# TASKS.md Specification

v0.5 (Draft)

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
1. Find the repository root (the directory containing `.git`)
2. Search for all `TASKS.md` files under the root, excluding `.git/` and `node_modules/`
3. Read all discovered files and consider tasks together, prioritized by P-level regardless of which file they're in

Task IDs should be unique across all `TASKS.md` files in the repo so blocker references are unambiguous. Blocker references work across files — the agent searches all applicable `TASKS.md` files for the ID.

**When to split**: Consider separate files when a single TASKS.md exceeds ~50 tasks, or when teams working in different packages rarely overlap on tasks.

## Format

```markdown
# Tasks
Spec v0.5

## P0

- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Tags**: backend, auth
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints (@cursor-1)
  - **Tags**: backend
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Blocked by**: auth-fix

## P2

- [ ] Update README with new API endpoints

## P3

- [ ] Support WebSocket connections
```

### Version

The spec version is declared as plain text under the heading:

```markdown
# Tasks
Spec v0.5
```

Capitalized but not bold — visually distinct from task metadata (which uses bold labels). Visible when rendered and tells both humans and tools which format to expect. If omitted, the latest version is assumed.

### Priority Sections

Tasks are organized under four priority headings — `## P0` through `## P3`:

| Heading | When to use |
|---------|-------------|
| `## P0` | System is broken or users are blocked. Drop everything. |
| `## P1` | Core work that should ship. Default for planned features and important bugs. |
| `## P2` | Valuable but not blocking. Do after P0 and P1 are clear. |
| `## P3` | Someday. Kept for reference, not actively worked. |

P0–P3 is a widely-used priority scale (PagerDuty, Google SRE, most incident management systems). We adopt it directly rather than inventing a new scheme.

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
  - **Tags**: backend, auth
  - **Details**: JWT refresh returns 500 on expired tokens.
    Catch TokenExpiredError and issue a new token.
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added
  - **Blocked by**: jwt-upgrade
```

Metadata values can span multiple indented lines. Everything indented under the bold label is part of that field's value:

```markdown
- [ ] Migrate payment processing to Stripe v2 API
  - **ID**: stripe-v2
  - **Tags**: backend, payments
  - **Details**: The current integration uses Stripe v1 which is deprecated.
    Key changes needed:
    - Replace `charges.create()` with `paymentIntents.create()`
    - Add support for 3D Secure authentication flow
    - Update webhook handlers for new event format
    - Migrate stored customer payment methods using Stripe's batch tool
    The v1 API will be removed on 2025-06-01. See https://stripe.com/docs/upgrades
  - **Files**: `src/payments/stripe.ts`, `src/webhooks/stripe.ts`,
    `src/payments/types.ts`, `tests/payments/stripe.test.ts`
  - **Acceptance**: All existing payment flows work on v2 API.
    3D Secure triggers correctly for EU cards.
    Webhook signature validation passes.
    No v1 API calls remain in codebase.
```

| Field | Purpose |
|-------|---------|
| **ID** | Stable identifier for blocker references and cross-file linking |
| **Tags** | Lowercase, comma-separated labels for filtering and orchestrator routing |
| **Details** | Implementation guidance, context, approach |
| **Files** | Relevant file paths (backtick-quoted, comma-separated) |
| **Acceptance** | Definition of done |
| **Blocked by** | Task ID(s) of blocking tasks — comma-separated if multiple |

All metadata is optional. A bare `- [ ] Fix the typo` is a valid task.

Teams can add custom metadata fields beyond these six (e.g., estimates, assignees). The fields above are the ones the spec defines behavior for.

Tags are lowercase, freeform labels. Teams should document their tag vocabulary in AGENTS.md to keep values consistent across tasks and agents.

### Blockers

Blockers reference tasks by their **ID**:

```markdown
- [ ] Deploy to production
  - **Blocked by**: auth-fix, rate-limit
```

An agent checking blockers searches all applicable `TASKS.md` files for the referenced IDs. If an ID is not found in any file, that blocker is resolved (the task was completed and removed). The **Blocked by** line can be cleaned up by any agent, but the search is what determines whether a task is actually blocked.

Agents should:
1. Skip blocked tasks when selecting work
2. Prioritize tasks that block other work — unblocking has the highest impact

### Sub-tasks

Tasks can have sub-tasks as nested checkboxes. Metadata comes first, then sub-tasks:

```markdown
- [ ] Implement user authentication (@cursor-1)
  - **ID**: auth
  - **Details**: Use JWT with refresh tokens
  - **Acceptance**: All auth endpoints working, tests pass
  - [x] Design auth schema
  - [x] Set up JWT token generation
  - [ ] Add login endpoint
  - [ ] Add logout endpoint
```

Rules:
- Metadata fields come first, sub-tasks after
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

In multi-agent setups, the agent should commit and push the claim immediately so other agents see it. In single-agent setups, the claim can be combined with the work commit — there's no one to race against.

### Agent Identity

The recommended format is `@<tool>-<instance>`:

| Example | Meaning |
|---------|---------|
| `@claude-code` | Claude Code CLI |
| `@codex` | OpenAI Codex CLI |
| `@cursor-1` | Cursor, window 1 |
| `@gemini` | Gemini CLI |
| `@cascade-bg` | Windsurf Cascade, background |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@pipeline-a1b2` | Orchestrator pipeline |

Teams can define their own identity convention in AGENTS.md. The key requirement is that identifiers distinguish concurrent instances of the same tool.

### Limitations

Claiming is best-effort, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice this is rare — agents work on different timescales and the claim window is small. For stronger guarantees, use an MCP server as the coordination backend.

Claims are only visible to other agents after the commit is pushed. An unpushed claim protects nothing in a multi-agent setup.

Stale claims from crashed agents should be handled per team convention (e.g., "reclaim tasks with no commit activity for 30 minutes"). Document this in your AGENTS.md.

## Completion

When a task is done, the agent removes it from the file — the task line, its metadata, and all its sub-tasks. The entire block is removed as a unit. Completed task history lives in git log.

This keeps the file focused on pending work. Each agent works on a different task (via claiming), so removals target different lines and merge cleanly.

## Agent Behavior

### Reading Tasks

Agents should read TASKS.md:
- **On session start** — before asking the user what to work on
- **After completing a task** — to pick up the next item
- **When asked to "work on the next task"** or similar

Before picking a new task, the agent should check if it already has a claimed task (from a previous session that ended before completion). If so, resume that task instead of claiming a new one. This prevents orphaned claims and duplicate work.

A missing or empty TASKS.md is not an error — the agent should tell the user there are no tasks and ask for instructions. If no TASKS.md file exists anywhere in the repo, the agent should not create one unprompted.

### Writing Tasks

When an agent discovers new work during implementation ("this function needs refactoring," "found a bug in the adjacent module"), it should add a task:

- Append to the **end** of the appropriate priority section
- Use **P2** as the default if unsure of priority — it's valuable but not blocking
- Add an **ID** if other tasks might need to reference it as a blocker
- Include at least **Details** so the next agent has context

In multi-agent setups, the **orchestrator should be the sole writer** of new tasks. This avoids merge conflicts from multiple agents appending to the same section simultaneously. Agents should claim and remove tasks regardless of setup — only *adding* new tasks needs coordination.

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

## Agents
- @backend-agent: tags backend, database, infra
- @frontend-agent: tags frontend, ux
- @docs-agent: tags docs
```

## Agent Commands

Ready-made `/next-task` commands are available for [Claude Code](https://code.claude.com/docs/en/skills), [Codex](https://developers.openai.com/codex/skills), [Cursor](https://cursor.com/changelog/1-6), [Gemini CLI](https://geminicli.com/docs/cli/custom-commands/), and [Windsurf](https://docs.codeium.com/windsurf/workflows). Each implements the full pick → claim → work → remove → loop cycle. See the [commands/](https://github.com/tasksmd/tasks.md/tree/main/commands) directory.

Invocation syntax varies by agent:

| Agent | Invoke |
|-------|--------|
| Claude Code | `/next-task` |
| Codex | `$next-task` |
| Cursor | `/next-task` |
| Gemini CLI | `/next-task` |
| Windsurf | `/next-task` |

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

### Tag-Based Routing

Orchestrators can use **Tags** to route tasks to specialized agents. The orchestrator matches task tags against agent capabilities (declared in the AGENTS.md `## Agents` section) and assigns accordingly.

Tasks without tags are available to any agent. Tagged tasks are preferentially routed to matching agents but not exclusively locked — any agent can claim an unmatched task if no specialist is available.

This works whether the orchestrator is a server, a CI pipeline, or a human running agents from chat.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | AGENTS.md = how to work. TASKS.md = what to work on. |
| [MCP](https://modelcontextprotocol.io/) | An MCP server can provide read/write access to TASKS.md. |
| GitHub Issues / Jira | Issues track features for teams. TASKS.md tracks implementation steps for agents. A single Issue may produce multiple TASKS.md entries. |

## Design Decisions

### Why is the version line plain text instead of a structured field?

`Spec v0.5` as plain text is an intentional tradeoff for simplicity. A structured header (YAML frontmatter, HTML comment) would be easier to parse but harder for humans to type and read. LLMs parse "Spec v0.5" reliably, and the line's fixed position (first non-empty line after `# Tasks`) makes it unambiguous in practice.

### Why not enforce task ordering within a priority section?

Ordering within a section is inherently subjective — "most important P1" depends on context that changes hourly. The spec recommends placing the most important task first, but doesn't enforce it. Agents should treat all tasks in a section as roughly equal priority and use blocker relationships to determine sequencing.

### Isn't best-effort claiming too weak for real coordination?

For file-based coordination, yes — two agents can theoretically race to claim the same task. In practice this is rare because the claim window is a single git commit. For stronger guarantees, use an MCP server as the coordination backend (a tasks-mcp server is on the [roadmap](TASKS.md)). The spec defines the protocol; the transport can be upgraded without changing the format.

### Why delete completed tasks instead of marking them done?

Git log is the archive by design. A `## Done` section or `[x]` marker would grow unboundedly and add noise to a file that should show only pending work. `git log -p --all -S "auth-fix"` finds any completed task instantly. This mirrors how CI pipelines work — the queue shows pending jobs, not historical runs.

### Why does `commands/` use its own directory structure instead of dotfile paths?

`commands/` is a neutral staging area that users copy from. Mirroring dotfile paths (`.claude/skills/`, `.cursor/commands/`) in the repo would imply the repo itself is a project that uses these agents, which it isn't. The directory names (`claude/`, `cursor/`, `gemini/`, etc.) are clear enough, and the README install table shows exactly where each file goes.

### Why does the complex example mix so many concepts?

`examples/complex-tasks.md` is specifically the "everything together" example — multiline details, sub-tasks, blockers, tags, and claims in one file. The other examples (`web-app.md`, `cli-tool.md`) demonstrate simpler patterns. Having one example that shows how all features compose is important for users who need the full feature set.

## Spec Versioning

This specification follows [Semantic Versioning](https://semver.org/). Breaking changes increment the minor version during 0.x development. Full version history is in the git log.
