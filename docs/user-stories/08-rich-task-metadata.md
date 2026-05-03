# User Story: Rich Task Metadata for Blocked, Multi-Session, and Decomposed Work

> I want my queue to model the messy reality — tasks that are blocked on humans, tasks that grow context across sessions, big tasks that need to be broken down, and project-level rules that apply to every task.

The basic fields (`**ID**`, `**Tags**`, `**Details**`, `**Files**`, `**Acceptance**`, `**Blocked by**`) cover most tasks in a single session. This story covers the spec features you reach for when work spans multiple sessions, agents, or external decisions:

- `**Blocked**` — external constraint (vs. `**Blocked by**` which is task-to-task)
- `**Research**` + `**Last-enriched**` — agent-accumulated notes for blocked tasks
- `**Parent**` — task decomposition trail
- Standing audit loops — recurring queue-filling pattern
- HTML policy comments — project-level rules that apply to every task

All fields and patterns are defined in [`spec.md`](../../spec.md). This story shows when to use each one with runnable examples.

## `**Blocked**` vs. `**Blocked by**`

`**Blocked by**` references *another task ID* — the algorithm is well-defined: search every `TASKS.md` for that ID, and the task is unblocked when no match exists.

`**Blocked**` is *anything else* — needs-user-approval, missing credentials, policy refusal, awaiting external action. Free-form text. Any non-empty value blocks the task.

Both fields can appear on the same task. The task is pickable only when both are clear.

```markdown
# Tasks

## P1

- [ ] Run quarterly database migrations
  - **ID**: db-migration-2026-q2
  - **Blocked by**: schema-review

- [ ] Schema review for Q2 migrations
  - **ID**: schema-review

- [ ] Post v1.2 release summary in #eng-announcements
  - **ID**: slack-release-notes
  - **Blocked**: needs-user-approval — posting publicly in Slack as the user
    requires explicit per-session approval. Ask the user to post this themselves
    or confirm exact text before unblocking.
```

The first task waits for `schema-review` to be removed. The third waits for the user to give explicit approval; no other task completion will resolve it.

| Situation | Field |
|-----------|-------|
| Another task must complete first | `**Blocked by**: <task-id>` |
| Needs user approval or a manual step | `**Blocked**: needs-user-approval — ...` |
| Requires credentials the agent doesn't have | `**Blocked**: needs-credentials — ...` |
| Violates a project policy the agent follows | `**Blocked**: policy-refused — ...` |
| Awaiting an external dependency outside the queue | `**Blocked**: needs-external-action — ...` |

The reason should be actionable — name what needs to happen before the task can be picked again.

## `**Research**` and `**Last-enriched**`

When every remaining task is blocked, agents shouldn't just sleep. They enrich blocked tasks with read-only research so the next session (or the human who unblocks it) inherits useful context.

Rules from the spec:

- Enrichment is read-only — no file edits outside `TASKS.md`, no shell side-effects, no network writes
- Enrichment never touches `**Blocked**:` or `**Blocked by**:` — unblocking is a human (or task-completion) decision
- The agent appends to `**Research**`, may extend `**Files**`/`**Acceptance**`, and stamps `**Last-enriched**: YYYY-MM-DD` on every visit
- A 7-day cooldown — agents skip tasks whose `**Last-enriched**` is fresher than 7 days

Example of a task enriched across two sessions:

```markdown
# Tasks

## P1

- [ ] Migrate cron jobs from Heroku Scheduler to GitHub Actions
  - **ID**: cron-migration
  - **Details**: Heroku Scheduler retires 2026-07-01. Move the four nightly
    jobs to GitHub Actions on the same schedule.
  - **Blocked**: needs-credentials — GitHub Actions runner needs the production
    DATABASE_URL secret, which only the platform team can provision.
  - **Research**: 2026-04-20 — initial sweep
    Found four scheduled jobs in `bin/cron/`: `purge-stale-sessions.ts`,
    `refresh-pricing-cache.ts`, `email-digest.ts`, `metrics-snapshot.ts`.
    Each currently reads `process.env.DATABASE_URL` directly.
    2026-04-27 — secret-shape check
    The platform team's runbook (`runbooks/secrets.md`) lists DATABASE_URL as
    available via `vault/postgres/prod`. Asking for `repo:cron-migration` token
    scope on next ticket review.
  - **Files**: `bin/cron/purge-stale-sessions.ts`, `bin/cron/refresh-pricing-cache.ts`,
    `bin/cron/email-digest.ts`, `bin/cron/metrics-snapshot.ts`,
    `.github/workflows/cron.yml`
  - **Last-enriched**: 2026-04-27
```

`**Research**` is the agent's scratchpad. `**Details**` stays clean — it's the original brief from whoever queued the work. When the block clears, the developer who picks the task inherits the research and can move faster.

The lint rule pins this contract: `**Research**` cannot be empty (that's almost always a mistake), and `**Last-enriched**` must be an ISO date.

## `**Parent**` — Task Decomposition

A `**Parent**` field links a sub-task back to the larger task it was split from. Use it when a P1 epic gets decomposed into 2-4 one-commit-sized children — the parent stays in the queue (or gets removed once decomposed), and each child carries the trail.

```markdown
# Tasks

## P1

- [ ] Implement feature flag system across services
  - **ID**: feature-flags-epic
  - **Details**: Decomposed into the four children below. Remove this parent
    once all children land or merge them back if scope shrinks.

- [ ] Add feature-flag schema to Postgres
  - **ID**: feature-flags-schema
  - **Parent**: feature-flags-epic

- [ ] Wire feature-flag client into the API server
  - **ID**: feature-flags-api
  - **Parent**: feature-flags-epic
  - **Blocked by**: feature-flags-schema

- [ ] Wire feature-flag client into the web app
  - **ID**: feature-flags-web
  - **Parent**: feature-flags-epic
  - **Blocked by**: feature-flags-schema

- [ ] Document feature-flag rollout playbook
  - **ID**: feature-flags-docs
  - **Parent**: feature-flags-epic
  - **Blocked by**: feature-flags-api, feature-flags-web
```

`**Parent**` is decomposition history, not a runtime constraint. The pick algorithm doesn't read it — it's a paper trail for humans (and future audits). Use `**Blocked by**` for actual ordering between children, as in the example.

When to decompose vs. use sub-tasks (nested checkboxes):

| Pattern | Use when |
|---------|----------|
| Sub-tasks (`- [x]` nested under a task) | One agent finishes the whole thing in one session |
| `**Parent**` + separate top-level tasks | Children can be parallelized, span sessions, or ship independently |

## Standing Audit Loops

A standing audit loop is a regular task that asks an agent to *queue* follow-up work, not implement it. Drop it into a repo when you want a recurring queue-filling pass without copying a long audit prompt into every project.

The canonical shape:

```markdown
# Tasks

## P2

- [ ] Run the standard audit gap loop and queue follow-up work
  - **ID**: standing-audit-gap-loop
  - **Tags**: standing-loop, audit, queue
  - **Details**: Use the standard standing audit loop. Repo-specific inputs:
    - Compare `README.md`, `docs/user-stories/`, and current CLI help output
    - Check competitors listed in `docs/VISION.md`
    - Ignore deployment tasks; this repo is local-only
  - **Files**: `README.md`, `docs/user-stories/`, `docs/VISION.md`, `TASKS.md`
  - **Acceptance**: TASKS.md contains deduplicated tasks for every actionable
    gap found, or the commit explains that no gaps were found. No source files
    changed outside TASKS.md.
```

The agent runs the loop with these rules (also in [`spec.md`](../../spec.md#standing-audit-loops)):

1. Audit only — read files and inspect behavior, but don't implement findings
2. Add or refine actionable tasks in `TASKS.md` with full metadata
3. Remove the standing-loop block in the same commit as the new tasks
4. Stop after the audit commit; the next `/next-task` invocation can implement the queued work

The `tasks pick` algorithm and `commands/next-task.md` skip standing-loop tasks during automatic queue-walking — they're picked only when explicitly targeted as `/next-task standing-audit-gap-loop`.

## Policies — Project Rules in HTML Comments

Policies are project-level instructions embedded in `TASKS.md` that guide agent behavior when picking and executing tasks. They live in HTML comments so they're invisible in rendered Markdown but readable by agents and parsers.

### File-level policies

Place an HTML comment between `# Tasks` and the first priority section. Each `policy:` line is one directive; multiple policies can share one comment block:

```markdown
# Tasks

<!-- policy: Run the full test suite before every commit. Never skip CI.
     policy: Database migrations must be backward-compatible (no dropping columns).
     policy: Never commit directly on main — create a feature branch. -->

## P0

- [ ] Fix the crash on startup
```

### Section-level policies

Place an HTML comment immediately after a priority heading to scope policies to that section:

```markdown
# Tasks

## P1

<!-- policy: P1 tasks require a linked Jira ticket in the commit message.
     policy: Get approval from @lead before starting any P1 work. -->

- [ ] Add rate limiting to public API
```

Section-level policies are additive — agents follow both file-level and section-level policies for tasks in that section.

### Freeform comments

HTML comments without `policy:` prefixes are notes for humans — agents may read them for context but should not treat them as directives:

```markdown
# Tasks

<!-- Last reviewed: 2026-04-01. Next quarterly review: 2026-07-01. -->
<!-- policy: All database migrations must be backward-compatible. -->

## P0

- [ ] Add the new index on users.email
```

The first comment is a human note. The second is a policy directive. The `policy:` prefix is what distinguishes them.

The lint rule guards three failure modes:

- A `policy:` directive outside an HTML comment (wrap it in `<!-- ... -->`)
- An empty `policy:` directive (`<!-- policy: -->` with nothing after the colon)
- An unclosed HTML comment (`<!--` with no matching `-->`)

## When to Reach for Each Field

| Situation | Field(s) |
|-----------|----------|
| Task is blocked on a human, credential, or external system | `**Blocked**` |
| Task depends on another task ID | `**Blocked by**` |
| Agent is enriching a blocked task with read-only research | `**Research**` + `**Last-enriched**` |
| Big task was split into smaller top-level tasks | `**Parent**` on each child |
| Need a recurring queue-refill pass | Standing audit loop task |
| Whole project follows a rule (test gates, branch policy, etc.) | File-level `<!-- policy: ... -->` |
| One priority section follows extra rules | Section-level `<!-- policy: ... -->` |

## Files Involved

| File | Purpose |
|------|---------|
| [`spec.md`](../../spec.md) | Authoritative definition of every field and pattern |
| [`examples/complex-tasks.md`](../../examples/complex-tasks.md) | A single TASKS.md that exercises every field together |
| [`packages/lint/`](../../packages/lint/) | Linter rules that pin `**Blocked**`, `**Research**`, `**Last-enriched**`, and policy formats |
| [`packages/parser/`](../../packages/parser/) | Reference parser that exposes every field on `task.metadata` |
| [`packages/mcp/`](../../packages/mcp/) | MCP server that surfaces the same fields to agents |

## Try it yourself

Sixty-second walkthrough — write a blocked task with empty `**Research**`, watch the linter reject it, then add real notes and a `**Last-enriched**` date and watch it pass.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q

# 1) Empty **Research** — lint flags the line and exits 1.
cat > TASKS.md <<'EOF'
# Tasks

## P1

- [ ] Migrate cron jobs
  - **Blocked**: needs-credentials — DATABASE_URL not provisioned
  - **Research**:
EOF
npx -y @tasks-md/lint TASKS.md || echo "lint exit $?"

# 2) Add real notes + an ISO **Last-enriched** date — lint exits 0.
cat > TASKS.md <<'EOF'
# Tasks

## P1

- [ ] Migrate cron jobs
  - **Blocked**: needs-credentials — DATABASE_URL not provisioned
  - **Research**: 2026-04-20 — drafted runner config sketch.
  - **Last-enriched**: 2026-04-20
EOF
npx -y @tasks-md/lint TASKS.md               # exits 0 — both fields are well-formed
cd .. && rm -rf tmp-tasks-demo
```

The first run prints something like ``ERROR: TASKS.md:7: **Research** must have a non-empty value`` and exits 1. The second run prints `Checked 1 file(s), found 0 error(s)` and exits 0. Swap the date for `yesterday` to see `**Last-enriched**` reject anything that isn't `YYYY-MM-DD`.
