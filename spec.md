# TASKS.md Specification

v1.0

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
3. Sort discovered files by path (lexicographic) for deterministic order across machines
4. Read all discovered files and consider tasks together, prioritized by P-level regardless of which file they're in

Task IDs should be unique across all `TASKS.md` files in the repo so blocker references are unambiguous. Blocker references work across files — the agent searches all applicable `TASKS.md` files for the ID.

**When to split**: Consider separate files when a single TASKS.md exceeds ~50 tasks, or when teams working in different packages rarely overlap on tasks.

## Format

```markdown
# Tasks

<!-- policy: Run tests before every commit. Never skip CI checks.
     policy: Prefer fixing root causes over symptoms. -->

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

### Policies

Policies are project-level instructions embedded in TASKS.md that guide agent behavior when picking and executing tasks. They live in HTML comments so they're invisible in rendered Markdown but readable by agents and parsers.

#### File-level policies

Place an HTML comment between `# Tasks` and the first priority section:

```markdown
# Tasks

<!-- policy: Before building ANY new feature, check if an upstream tool already does this.
     policy: Codebase target is <20K non-test source lines. Shrinking is always a valid PR.
     policy: Every PR must include tests. No exceptions.
     policy: Never commit directly on main — create a feature branch. -->

## P0

- [ ] Fix the crash on startup
```

Each `policy:` line is a single directive. Agents should read all policies before picking a task and follow them throughout their work session. Policies are project context that applies to **every task** in the file.

#### Section-level policies

Place an HTML comment immediately after a priority heading to scope policies to that section:

```markdown
## P1

<!-- policy: P1 tasks require a linked Jira ticket in the commit message.
     policy: Get approval from @lead before starting any P1 work. -->

- [ ] Add rate limiting to public API
```

Section-level policies apply only to tasks in that section. They are additive — agents should follow both file-level and section-level policies.

#### Freeform comments

HTML comments without `policy:` prefixes are treated as notes for humans — agents may read them for context but should not treat them as directives:

```markdown
# Tasks

<!-- Last reviewed: 2026-04-01. Next quarterly review: 2026-07-01. -->
<!-- policy: All database migrations must be backward-compatible. -->

## P0
```

The first comment is a human note. The second is a policy directive. The `policy:` prefix is what distinguishes them.

#### Policy format

- Each policy starts with `policy:` (case-insensitive) followed by one directive
- Multiple policies can share a single HTML comment block (one per line)
- Policies are plain text — no special syntax, no keys, no values. Write them as instructions you'd give to a person.
- Keep policies concise and actionable. A good policy is one sentence that changes agent behavior.

| Scope | Location | Applies to |
|-------|----------|-----------|
| File-level | Between `# Tasks` and first `## P*` | All tasks in the file |
| Section-level | Immediately after a `## P*` heading | Tasks in that section only |

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
| **Plan** | Agent-managed checklist of implementation steps for complex tasks; added before coding and removed with the completed task |
| **Blocked by** | Task ID(s) of blocking tasks — comma-separated if multiple |
| **Blocked** | Free-form reason why the task cannot be picked right now. Distinct from **Blocked by** — use when the block is external (missing approval, policy refusal, environment access) rather than another task ID |
| **Parent** | Parent task ID when a large task is decomposed into smaller top-level tasks |
| **Research** | Free-form research notes accumulated by agents while the task is blocked. Distinct from **Details** (author intent) so reviewers can tell what came from the agent. See [Enriching blocked tasks](#enriching-blocked-tasks) |
| **Last-enriched** | ISO date (`YYYY-MM-DD`) marking the last time an agent added research notes to the task. Used as an idempotency / cooldown gate so agents don't re-enrich the same task every session |

All metadata is optional. A bare `- [ ] Fix the typo` is a valid task.

Teams can add custom metadata fields beyond these defined fields (e.g., estimates, assignees). The fields above are the ones the spec defines behavior for.

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

### Blocked for a reason

Not every blocker is another task. Tasks can be blocked by an **external constraint** — a missing approval, a policy refusal, a credential the agent does not have, or a manual step the user needs to perform. Use the **Blocked** metadata field to record this with free-form text:

```markdown
- [ ] Post the v1.2 release summary in #eng-announcements
  - **ID**: slack-release-notes
  - **Blocked**: needs-user-approval — posting publicly in Slack as the user
    requires explicit per-session approval. Ask the user to post this themselves
    or confirm before unblocking.
```

Rules:

- **Blocked** is plain text — any non-empty value marks the task as blocked for task-picking purposes
- A task with a non-empty **Blocked** field is skipped by agents the same way a task with an unresolved **Blocked by** is skipped
- **Blocked** and **Blocked by** can coexist on the same task — both must be clear before the task is picked
- The reason should be actionable: it names what needs to happen before the task can be picked again (e.g., "user approval", "production credentials provisioned", "legal sign-off received")
- Remove the **Blocked** line once the external blocker is resolved; the task then becomes eligible again
- Agents that detect a forbidden action while picking a task (for example, posting publicly as the user without approval) should add this field with a clear reason instead of silently skipping — so future sessions see the block and don't re-attempt the same work

When to use **Blocked** vs. **Blocked by**:

| Situation | Field |
|-----------|-------|
| Another task must complete first | **Blocked by**: `<task-id>` |
| Needs user approval or a manual step | **Blocked**: `needs-user-approval — ...` |
| Requires credentials the agent doesn't have | **Blocked**: `needs-credentials — ...` |
| Violates a project policy the agent follows | **Blocked**: `policy-refused — ...` |
| Awaiting external dependency outside the queue | **Blocked**: `needs-external-action — ...` |

Teams are free to pick their own short reason codes (the prefix before the `—`) or leave the reason as a single sentence. The spec only requires the field value to be non-empty.

### Standing audit loops

A standing audit loop is a regular TASKS.md task that asks an agent to audit the repo and write follow-up tasks, not fix the findings immediately. Use it when a repo needs a recurring queue-filling pass but you do not want to copy a long audit prompt into every project.

The canonical pattern is a compact task with:

- `**ID**: standing-audit-gap-loop`
- `**Tags**: standing-loop, audit, queue`
- `**Details**:` for repo-specific audit inputs: docs to read, competitor or user-story references, product constraints, and areas to ignore
- `**Files**:` for the files or directories the agent should inspect first
- `**Acceptance**:` that says the agent only adds or updates TASKS.md tasks, removes the standing-loop task when done, and does not implement the findings in the same run

```markdown
- [ ] Run the standard audit gap loop and queue follow-up work
  - **ID**: standing-audit-gap-loop
  - **Tags**: standing-loop, audit, queue
  - **Details**: Use the standard standing audit loop. Repo-specific inputs:
    - Compare README.md, docs/user-stories/, and the current CLI help
    - Check competitors listed in docs/VISION.md
    - Ignore deployment tasks; this repo is local-only
  - **Files**: `README.md`, `docs/user-stories/`, `docs/VISION.md`,
    `TASKS.md`
  - **Acceptance**: TASKS.md contains deduplicated tasks for every actionable
    gap found, or the commit explains that no gaps were found. No source files
    changed outside TASKS.md.
```

Agents execute standing audit loops with these rules:

1. Treat **Details** and **Files** as the repo-specific audit brief. If they are sparse, fall back to README.md, AGENTS.md, user stories, examples, package scripts, and recent git history.
2. Audit only. Read files, run local read-only checks, and inspect behavior as needed, but do not implement code or docs fixes discovered by the audit.
3. Add or refine actionable tasks in TASKS.md with IDs, tags, details, files, and acceptance criteria. Avoid duplicates by checking existing task IDs and summaries first.
4. Remove the standing-loop task block in the same commit that adds or updates the follow-up tasks. If no gaps are found, remove the task and make the commit message say the audit found no queue additions.
5. When invoked as `/next-task standing-audit-gap-loop`, stop after that commit. The next `/next-task` run can implement the newly queued work.

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

### When to use sub-tasks vs. separate tasks

**Default to sub-tasks.** Use them when steps are sequential, owned by one agent, and only valuable as part of the whole. Sub-tasks keep context (Details, Acceptance) in one place and show progress without cluttering the queue.

**Promote to separate top-level tasks when:**
- Two or more agents can work on the steps in parallel
- A step spans multiple sessions or days
- A step produces a shippable artifact on its own
- Steps are in different parts of the codebase with no shared context

**Decision rule:**

> Can one agent complete all the steps in a single session? → Sub-tasks.
> Does any step need a different agent, or could it ship independently? → Separate tasks with `**Blocked by**:`.

When promoting, move the shared context (Details, Acceptance, Files) to whichever task needs it most, or repeat the essentials on each child. Add an `**ID**:` to each task so the blocker graph is explicit.

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
| `@devin` | Devin |
| `@gemini` | Gemini CLI |
| `@cascade-bg` | Windsurf Cascade, background |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@pipeline-a1b2` | Orchestrator pipeline |

Teams can define their own identity convention in AGENTS.md. The key requirement is that identifiers distinguish concurrent instances of the same tool.

### Limitations

Claiming is best-effort, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice this is rare — agents work on different timescales and the claim window is small. For stronger guarantees, use an MCP server as the coordination backend.

Claims are only visible to other agents after the commit is pushed. An unpushed claim protects nothing in a multi-agent setup.

### Stale Claims

A claim becomes stale when the claiming agent crashes or its session ends before completing the task. Two recovery paths:

1. **Same agent restarts** — The agent's `/next-task` command checks for its own prior claims and resumes (see Reading Tasks). This is the common case and is handled automatically.

2. **Different agent encounters a claimed task** — Check `git log` for recent commits by the claiming agent. If the repo has no commits referencing that agent's work in the last 30 minutes, the claim is likely stale. The agent should ask the user before reclaiming — never silently steal another agent's task.

To reclaim: replace the stale `(@old-agent)` with `(@your-agent-id)` on the task line.

Teams with specific SLAs or automated reclamation should document their policy in AGENTS.md.

## Completion

When a task is done, the agent removes it from the file — the task line, its metadata, and all its sub-tasks. The entire block is removed as a unit. Completed task history lives in git log.

Top-level tasks should never be marked `[x]`. The `[x]` checkbox is only for sub-tasks tracking progress on a parent. When a top-level task is complete, remove the entire block — don't check the box. Linters should flag `[x]` on top-level tasks as a warning.

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

If an orchestrator manages the file (declared in AGENTS.md), the **orchestrator is the sole writer** of new tasks — agents report discovered work to the orchestrator instead of writing directly. This avoids merge conflicts from multiple agents appending to the same section simultaneously. Claiming and removing tasks is always done by the agent, regardless of setup.

### Enriching blocked tasks {#enriching-blocked-tasks}

A task blocked by `**Blocked**:` (external constraint) or an unresolved `**Blocked by**:` (task dependency) is not pickable, but it is not idle work. When an agent's turn comes up and every remaining task is blocked, the agent should spend that turn **enriching** the blocked tasks with read-only research so a human or the next agent has less discovery work to do once the block resolves.

Rules:

- Enrichment is **read-only** against the codebase and the outside world. No file edits, no shell side-effects, no network writes. The only file the agent modifies is `TASKS.md` — and only within the task's own block.
- Enrichment **never touches** `**Blocked**:` or `**Blocked by**:` lines. Unblocking a task remains a human decision (for **Blocked**) or a task-completion event (for **Blocked by**).
- Enrichment applies to both kinds of blocks. For a `**Blocked**: needs-user-approval — post in Slack`, the agent drafts the exact message text. For `**Blocked by**: schema-migration`, the agent reads the blocker's current state and sketches how this task will consume the migration's output.
- The agent appends to `**Research**:` (use a dated subheading like `2026-04-20 — <label>` when accumulating over multiple sessions), may extend `**Files**:` and `**Acceptance**:`, and stamps `**Last-enriched**: YYYY-MM-DD` so future sessions can tell how fresh the notes are.
- A cooldown prevents thrash: agents skip tasks whose `**Last-enriched**` is less than 7 days old. When every blocked task is fresh, the agent moves on (roam to another repo, run an audit, or stop).
- One enrichment per agent turn is enough. The point is to land durable context, not to run a background loop.

Example of a task enriched across sessions:

````markdown
- [ ] Post v1.2 release summary in #eng-announcements
  - **ID**: slack-release-notes
  - **Details**: Share the headline changes, deploy timing, and support channel
    once the release PR lands.
  - **Blocked**: needs-user-approval — posting publicly in Slack as the user
    requires explicit per-session approval.
  - **Research**: 2026-04-20 — draft message
    ```
    :rocket: v1.2 is live — highlights:
    • Rate limiter now honors `X-Api-Key` headers (fixes the internal-tools 429s)
    • Webhook processor is idempotent by event ID (no more dup charges)
    • New `tasks pick --tag <tag>` flag in the CLI
    Deploying 09:00 Pacific; rollback plan in runbooks/rate-limiter.md.
    Questions → #support-eng or @on-call-lead.
    ```
    Recipients: #eng-announcements (default), #customer-success (crosspost).
    Tone sampled from past releases in git log — short bullet list + rollback
    link is the established format.
  - **Last-enriched**: 2026-04-20
````

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

Ready-made `/next-task` commands are available for [Claude Code](https://code.claude.com/docs/en/skills), [Codex](https://developers.openai.com/codex/skills), [Cursor](https://cursor.com/changelog/1-6), [Devin](https://windsurf.com/devin), [Gemini CLI](https://geminicli.com/docs/cli/custom-commands/), and [Windsurf](https://docs.codeium.com/windsurf/workflows). Each implements the full pick/target → claim → work → remove → loop cycle. See the [commands/](https://github.com/tasksmd/tasks.md/tree/main/commands) directory.

Passing an exact task ID targets that task instead of queue-picking. For example, `/next-task standing-audit-gap-loop` looks for `**ID**: standing-audit-gap-loop`, refuses missing, duplicate, claimed, or blocked targets, and stops after the targeted task is shipped.

Invocation syntax varies by agent:

| Agent | Invoke |
|-------|--------|
| Claude Code | `/next-task [task-id]` |
| Codex | `$next-task [task-id]` |
| Cursor | `/next-task [task-id]` |
| Devin | `/next-task [task-id]` |
| Gemini CLI | `/next-task [task-id]` |
| Windsurf | `/next-task [task-id]` |

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

Orchestrators can use **Tags** to route tasks to specialized agents. Agent capabilities are declared in the AGENTS.md `## Agents` section (e.g., `@backend-agent: tags backend, database`).

Matching algorithm:

1. **Untagged tasks** are available to any agent
2. **Tagged tasks** use **ANY-match** — an agent matches if it shares at least one tag with the task. A task tagged `backend, auth` matches an agent with `tags: backend, database` (overlap on `backend`)
3. Tags are a **soft preference**, not a hard filter — if no matching specialist is available, any agent can claim the task
4. When multiple tasks match, prefer the one with the most overlapping tags

This works whether the orchestrator is a server, a CI pipeline, or a human running agents from chat.

## Relationship to Other Standards

| Standard | Relationship |
|----------|-------------|
| [AGENTS.md](https://agents.md/) | AGENTS.md = how to work. TASKS.md = what to work on. |
| [MCP](https://modelcontextprotocol.io/) | The [`tasks-mcp`](packages/mcp/) server provides read/write access to TASKS.md via MCP tools. |
| GitHub Issues / Jira | Issues track features for teams. TASKS.md tracks implementation steps for agents. A single Issue may produce multiple TASKS.md entries. |

## Design Decisions

### Why is there no version line in TASKS.md files?

Earlier drafts included a `Spec v0.5` line after `# Tasks`. We removed it for v1 because:
1. LLMs parse the markdown structure directly — they don't need a version hint
2. The format is self-describing: `# Tasks`, `## P0`–`## P3`, `- [ ]` checkboxes, bold metadata labels
3. The spec commits to non-breaking, additive-only changes from v1 onward — so version branching is unnecessary
4. AGENTS.md (the companion standard) has no version line in documents either

### Why not enforce task ordering within a priority section?

Ordering within a section is inherently subjective — "most important P1" depends on context that changes hourly. The spec recommends placing the most important task first, but doesn't enforce it. Agents should treat all tasks in a section as roughly equal priority and use blocker relationships to determine sequencing.

### Isn't best-effort claiming too weak for real coordination?

For file-based coordination, yes — two agents can theoretically race to claim the same task. In practice this is rare because the claim window is a single git commit. For stronger guarantees, use the [`tasks-mcp`](packages/mcp/) server as the coordination backend. The spec defines the protocol; the transport can be upgraded without changing the format.

### Why delete completed tasks instead of marking them done?

Git log is the archive by design. A `## Done` section or `[x]` marker would grow unboundedly and add noise to a file that should show only pending work. `git log -p --all -S "auth-fix"` finds any completed task instantly. This mirrors how CI pipelines work — the queue shows pending jobs, not historical runs.

### Why does `commands/` use its own directory structure instead of dotfile paths?

`commands/` is a neutral staging area that users copy from. Mirroring dotfile paths (`.claude/skills/`, `.cursor/commands/`) in the repo would imply the repo itself is a project that uses these agents, which it isn't. The directory names (`claude/`, `cursor/`, `gemini/`, etc.) are clear enough, and the README install table shows exactly where each file goes.

### Why does the complex example mix so many concepts?

`examples/complex-tasks.md` is specifically the "everything together" example — multiline details, sub-tasks, blockers, tags, and claims in one file. The other examples (`web-app.md`, `cli-tool.md`) demonstrate simpler patterns. Having one example that shows how all features compose is important for users who need the full feature set.

### Why use HTML comments for policies instead of a metadata section?

HTML comments are invisible when rendered as Markdown — policies don't clutter the task list in GitHub, VS Code preview, or any Markdown viewer. They're still visible in the raw file, which is what agents and parsers read. Using a visible `## Policies` section would add visual noise to a file that should focus on pending work, and would break the `## P0`–`## P3` heading structure.

The `policy:` prefix inside comments distinguishes actionable directives from freeform notes. Without a prefix, agents would need to guess whether a comment is context ("last reviewed: March") or a rule ("always run tests"). The prefix makes intent explicit.

### Why a separate `**Blocked**` field instead of overloading `**Blocked by**`?

`**Blocked by**` references *other task IDs*. The algorithm for resolution is well-defined: search all `TASKS.md` files for the referenced IDs, and the task is unblocked when none are found.

External blockers don't fit that model. "Needs user approval", "waiting on a credential from ops", or "agent refused because the action is posting publicly as the user" aren't task IDs and they don't resolve by task completion. Overloading `**Blocked by**` with free-form text would break tooling that validates blocker references as IDs, and it would make the **Blocked by** resolution algorithm ambiguous.

A separate `**Blocked**` field keeps the two concerns distinct:

- `**Blocked by**: auth-fix, rate-limit` — task dependency graph, resolved by task completion
- `**Blocked**: needs-user-approval — ...` — external constraint, resolved by a human or a different system

Both mark a task as not-pickable. Both can appear on the same task. Linters validate each independently — **Blocked by** refs must exist, **Blocked** text must be non-empty.

### Why a separate `**Research**` field instead of appending to `**Details**`?

`**Details**` is the **author's** intent — what the human queuer wanted the task to do. Keeping it clean makes the task queue human-friendly: a reviewer can see what was asked for without wading through agent-generated notes.

`**Research**` is the **agent's** accumulated context — read-only findings from codebase exploration, drafted message text, sketched implementation approaches. Separating the two means:

1. Reviewers can tell at a glance which parts came from a human vs. an agent, and can trust **Details** as the source of truth for intent.
2. Agents can confidently overwrite or reorganize their own research over time without risking the author's original wording.
3. Diffs stay small and focused — "enriched with research notes" commits touch only **Research**, **Last-enriched**, and maybe **Files**/**Acceptance** appendixes, never **Details**.
4. The `**Last-enriched**` marker is tied naturally to **Research** — it answers "when did an agent last look at this?" without confusing the author-managed fields.

When the task is unblocked and a developer picks it up, **Research** is the scratchpad they inherit from the last agent turn; **Details** is still the crisp brief they were given.

### Why not put policies in AGENTS.md instead?

AGENTS.md is for project-wide agent instructions — build commands, code conventions, architecture. Policies in TASKS.md are scoped to the **task queue** — they guide how agents pick and execute tasks, not how the project works in general. A policy like "P1 tasks require a Jira ticket" belongs with the tasks, not with the build instructions. Teams that want both can: AGENTS.md for project conventions, TASKS.md policies for queue-specific rules.

## Spec Versioning

This specification follows [Semantic Versioning](https://semver.org/). From v1.0 onward, all changes are non-breaking and additive — new optional features, new metadata fields, new recommendations. The format of existing TASKS.md files will never be invalidated by a spec update. Full version history is in the git log.
