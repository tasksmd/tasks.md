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
  - **Estimate**: 1h
  - **Details**: Use express-rate-limit, 100 req/min per IP
  - **Hypothesis**: Capping public endpoints at 100 req/min/IP drops the
    abusive-traffic 5xx rate from ~3% to <0.5% without affecting legitimate
    users (steady-state p95 latency unchanged).
  - **Success**: 5xx rate <0.5% over a 24h window post-deploy; p95 latency delta within ±10ms.
  - **Pivot**: if legitimate clients trip the limiter at >1% rate, the per-IP
    model is wrong — switch to per-API-key buckets instead of widening the cap.
  - **Measurement**:
    `curl -s https://api.example.com/metrics | grep http_5xx_rate_24h`
  - **Anchor**: Beyer et al., *SRE* 2016, Ch. 5 (eliminating toil with rate limits).
  - **Verification**: `vitest run tests/rate-limit.test.ts` exits 0; staging soak ≥1h with no false-positives.
  - **Risk**: shared NAT egress (corp networks) could trip the limit. Mitigation: `X-Forwarded-For` honored when behind trusted proxy.
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
| **Estimate** | Agent or human time estimate as free-form duration text — e.g., `30m`, `1h`, `2-3d`. Lets pickers reason about session-fit before claiming |
| **Verification** | Procedure for confirming the task is done. Distinct from **Acceptance** (the definition-of-done criterion); **Verification** is the runnable procedure or steps that exercise that criterion |
| **Risk** | Free-form `Risk: <what could go wrong>. Mitigation: <how it's handled>.` Surfaces the failure mode the author already considered so the agent doesn't re-discover it |
| **Hypothesis** | Pre-registered prediction (rule-#9): which observable behaviour will improve, by how much, and why. The first half of the [pre-registration block](#rule-9-pre-registration-block) |
| **Success** | Numeric or rubric threshold at or above which the change is kept. Pairs with **Hypothesis** and **Measurement** |
| **Pivot** | Threshold below which the *approach* (not just the change) is abandoned. Pre-registers the give-up criterion so the team doesn't keep iterating on a dead end |
| **Measurement** | Exact runnable shell / OTEL / CI command that produces the metric. No English instructions; reviewers must be able to copy-paste and reproduce |
| **Anchor** | Literature citation or internal reference justifying the metric and its threshold. Keeps the threshold from being arbitrary |
| **Touches** | Files this task is expected to **modify**. Comma-separated, backtick-stripped (same shape as **Files**). Distinct from **Files** (the broader "all relevant files" set, which may include read-only references) — **Touches** is the write-set. Used by orchestrators to detect file-set overlap when parallel-launching multiple agents; overlapping **Touches** sets indicate likely merge conflicts and should serialise rather than parallelise |
| **Surfaced-by** | Provenance: which audit, lint, observer session, sweep, or external report surfaced this task. Free-form text. Lets reviewers tell whether the task came from author intent or a deterministic gate, and lets agents find sibling findings from the same source |
| **Milestone** | Milestone identifier this task contributes to. Free-form text; teams pick the format (e.g., `M1.1`, `Q3-2026`, `v0.2.0`, `north-star-A`). Used by milestone-alignment gates and roadmap views to filter tasks by the milestone they unblock |

All metadata is optional. A bare `- [ ] Fix the typo` is a valid task.

The five rule-#9 fields — **Hypothesis**, **Success**, **Pivot**, **Measurement**, **Anchor** — are typically used together as a coherent block on non-trivial tasks. See [Rule-#9 pre-registration block](#rule-9-pre-registration-block) for the rationale and a worked example.

Teams can add additional custom metadata fields beyond these defined fields (e.g., assignees, sprint markers). The fields above are the ones the spec defines behavior for.

Tags are lowercase, freeform labels. Teams should document their tag vocabulary in AGENTS.md to keep values consistent across tasks and agents.

### Rule-#9 pre-registration block {#rule-9-pre-registration-block}

Non-trivial tasks — bugfixes, features, refactors — should declare what observable they expect to move *before* the code is written. The pattern is named after [Minsky](https://github.com/fyodoriv/minsky)'s constitutional rule #9 (`vision.md` § 9 — "every change is a pre-registered experiment"), the project that originated it as a TASKS.md convention.

The block is five fields, used together:

| Field | Captures |
|-------|----------|
| **Hypothesis** | Which observable will improve, by how much, why — Goal-Question-Metric framing (Basili-Caldiera-Rombach 1994) |
| **Success** | Numeric / rubric threshold at or above which the change is kept |
| **Pivot** | Threshold below which the **approach** is abandoned (not just the change reverted) — Ries 2011's pivot-or-persevere |
| **Measurement** | Exact runnable command, query, or test that produces the observable. No English |
| **Anchor** | Literature citation or internal reference justifying the metric and threshold |

Why these five together:

- **Pre-registration** (Munafò et al. 2017, *Nature Human Behaviour*) is what makes the prediction falsifiable. Picking the metric *after* seeing the result lets every change "succeed" against the most flattering observable. Committing the prediction in TASKS.md, before the implementation commit, prevents that.
- **Pivot threshold** is the discipline of declaring give-up criteria up front (Ries 2011, *The Lean Startup*). Without it, a failing approach gets iterated on indefinitely. With it, the next agent or reviewer can read the task block and recognise that the approach itself — not just this attempt — is what should be abandoned.
- **Measurement** must be a runnable command, not an English instruction. "Make sure latency drops" is not a measurement; `pnpm vitest run x.test.ts --reporter=json | jq -e '.numPassedTests >= 6'` is. Reproducibility is the point.
- **Anchor** keeps the threshold from being arbitrary. "p99 latency under 200 ms" with no anchor is a wish; the same threshold with "Beyer et al., *SRE* 2016, Ch. 4" is engineering.

A task that ships **Hypothesis** + **Success** + **Pivot** + **Measurement** + **Anchor** carries its own falsification criterion. After the change lands, anyone can rerun the **Measurement** command, compare against **Success** and **Pivot**, and decide whether to keep, iterate, or pivot — without re-litigating intent.

**Trivial changes are exempt.** A typo fix, a formatting churn, a no-op rename covered by passing tests — when the existing CI gate already *is* the metric, the rule-#9 block is redundant. Use judgement; document the exemption in the commit message rather than inventing a metric.

**Bugfixes are not exempt.** A bugfix's hypothesis is "the recurrence rate (or stability metric to which the bug contributes — error rate, MTTR, p99 latency, crash frequency) drops from X to Y after this fix". If that statement cannot be made — including its threshold and its measurement command — the root cause has not been identified and the fix is not ready to ship.

**Worked example** (abridged from Minsky's `tick-loop-daemon-v0`):

```markdown
- [ ] `tick-loop-daemon-v0` — production tick-loop daemon
  - **ID**: tick-loop-daemon-v0
  - **Tags**: runtime, supervision
  - **Estimate**: 2-3d
  - **Hypothesis**: A `run-tick-loop.sh` Node entry-point that loops
    `pickTask → checkBudget → claim → spawn → emitOtelSpans → complete`
    on a 5-min cadence makes the supervisor unit (already shipped) actually
    supervise something. MAPE-K (Kephart-Chess 2003) assumes a *running*
    monitor; the entire pipeline is dormant until the daemon exists.
  - **Success**: ≥6 dry-run iterations complete with mock tasks; OTEL spans
    visible per phase; `state/PAUSED` honored within 1 iteration.
  - **Pivot**: if spawning `claude` as a subprocess deadlocks on stdin/stdout,
    fall back to file-based handoff (write task brief to `state/inbox/<id>.md`,
    operator consumes). If lease-then-spawn loses tasks under crash, switch to
    spawn-then-lease with idempotent claim semantics.
  - **Measurement**:
    `pnpm vitest run novel/tick-loop/src/daemon.test.ts --reporter=json | jq -e '.numPassedTests >= 6 and .numFailedTests == 0'`
  - **Anchor**: Kephart & Chess, "The Vision of Autonomic Computing",
    *IEEE Computer* 36(1) 2003 (MAPE-K assumes a running monitor);
    Armstrong, *Programming Erlang*, 2007 (let-it-crash + supervisor restart).
  - **Verification**: `bash distribution/systemd/run-tick-loop.sh --dry-run
    --max-iterations=4` exits 0 with 4 mock tasks completed.
  - **Risk**: spawning a child process inside a service may not get the user's
    environment (API keys, MCP config). Mitigation: daemon explicitly sources
    `~/.zshenv` and reads `~/.claude/` config before spawn.
  - **Acceptance**: daemon survives `kill -9` mid-tick and respawns within
    MTTR <5 min; `tick.iteration` OTEL spans visible.
```

Notice how **Verification** (the procedure to demonstrate doneness) is distinct from **Measurement** (the runnable metric command) and from **Acceptance** (the definition-of-done criterion). The three answer different questions: *did it work, can we measure it, is it done?*

**Forbidden:**

- *Vanity metrics* — counts that always go up (lines of code, commits, hours, tasks-in-flight). They incentivise activity, not outcomes (Ries 2011; Doerr 2018).
- *Post-hoc metrics* — choosing the success criterion after seeing the change's effect. Pre-registration is the correction.

**Preparation-PR pattern.** When the metric in **Measurement** isn't yet runnable (no counter, no log line, no test harness), open a preparation PR that adds the instrumentation first. Land it. Then open the change PR against the now-measurable baseline, with before/after numbers. Skipping this and promising "we'll instrument later" rarely survives contact with the next sprint.

**Sources:**

- Basili, Caldiera, Rombach, "The Goal-Question-Metric Approach", *Encyclopedia of Software Engineering*, 1994.
- Ries, *The Lean Startup*, 2011 (build–measure–learn; pivot-or-persevere).
- Munafò, Nosek, Bishop, et al., "A Manifesto for Reproducible Science", *Nature Human Behaviour* 1, 0021, 2017 (pre-registration).
- Kohavi, Tang, Xu, *Trustworthy Online Controlled Experiments*, Cambridge University Press, 2020 (statistical rigour in A/B).
- Doerr, *Measure What Matters*, 2018 (OKRs; outcomes not activities).
- Forsgren, Humble, Kim, *Accelerate*, 2018 (DORA's four key metrics).

Originating implementation: [Minsky](https://github.com/fyodoriv/minsky) (`vision.md` § 9 — pre-registered hypothesis-driven development as a constitutional iron rule).

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

See [User Story 09](docs/user-stories/09-standing-audit-loops.md) for a worked example — when to reach for the pattern, how `pickBestTask` skips it during automatic walks, and the anti-pattern to avoid.

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

Claiming **in the file backend** is best-effort, not a distributed lock. Two agents can race to claim the same task if they read the file simultaneously. In practice this is rare — agents work on different timescales and the claim window is small. For a **collision-free** guarantee across a fleet, use the git-native backend (see [Fleet coordination](#fleet-coordination)) or an MCP server as the coordination backend.

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

Some repos may also require the completion commit to include `closes <task-id>` in the commit message, using lowercase `closes` followed by the task's exact kebab-case **ID**. This convention helps distinguish a doc-only commit that closes a queued task from untasked doc drift:

```text
docs: update setup notes

closes setup-docs
```

This keeps the file focused on pending work. Each agent works on a different task (via claiming), so removals target different lines and merge cleanly.

## Task backends

`TASKS.md` (local markdown) is the **default, canonical backend** — file-first, offline, no vendor lock-in (VISION.md G4). A repo MAY opt into an alternative **backend** so a team already living in an issue tracker can use the tasks.md workflow without migrating its work into a file (VISION.md G5). Backends are adapters behind the same surface: the spec, parser, CLI, and MCP behave identically regardless of where the work is stored.

### Selecting a backend

A repo declares its backend in a `.tasksmd.json` file at the git root (or the working directory when not in a repo):

```json
{
  "backend": "github-issues",
  "repo": "owner/repo",
  "label": "tasks.md"
}
```

- **`backend`** — `tasks-md` (default), `github-issues`, or `git-native` (the collision-free fleet backend — see [Fleet coordination](#fleet-coordination)). Unknown values are rejected.
- **`repo`** — `owner/repo` for `github-issues`; omit to use the current directory's repo.
- **`label`** — the marker label that identifies an issue as a task. Default `tasks.md`.

`tasks-md` is assumed when no config file is present, so existing repos are unaffected. A `--backend <kind>` flag on the CLI overrides the config per-invocation.

### The `github-issues` backend

Open issues carrying the marker **label** are the queue. The mapping to the task model is:

| Task concept | GitHub Issues representation |
| --- | --- |
| id | issue number (as a string) |
| priority `P0`–`P3` | a `priority/P0`..`priority/P3` label (the looser `critical`/`high`/`medium`/`low` and `p0`..`p3` labels are also read) |
| tags | all other labels (excluding the marker + priority labels) |
| claim | issue **assignee** (self-assign to claim) |
| completion | closing the issue — a merged PR with `Closes #N` does this automatically |

It shells out to the `gh` CLI, inheriting the user's existing auth, and requires only the `repo` token scope (no GitHub Project is required; a Project board is an optional view layer). When `gh` is unauthenticated, operations fail with an actionable error.

### Backend-aware commands

These operate identically across backends (`tasks-md` reads via the deterministic picker; `github-issues` via `gh`):

- `tasks pick` — highest-priority open, unclaimed task/issue.
- `tasks list` — open tasks/issues, highest priority first (supports `--priority`, `--tag`, `--unclaimed`).
- `tasks create "<title>" [--priority P2] [--body ...] [--tag ...]` — file a new task/issue.
- `tasks claim <id>` — claim (self-assign).
- `tasks complete <id>` — complete (close the issue / remove the TASKS.md block).

Workspace-mode aggregation (planned) ranks tasks across repos by reading each repo's backend through this same uniform surface, so a host can mix markdown-backed and issue-backed repos in one queue.

### Agent-mediated task operations

The human/agent contract is the same across every backend: **a human reads the queue and tells an agent what to do; the agent (or a tool acting for it) performs the task-state change.** In the file backend, hand-editing `TASKS.md` stays a valid zero-setup path because the file *is* the surface. In a **generated backend** (git-native, GitHub Issues) the human-visible `TASKS.md` or issue list is a projection of backend state, so mutations go through operations rather than a hand-edit — the human still issues the request ("add a task", "mark it done"); the agent runs the operation.

Every mutation reduces to one of eight **backend-neutral operations**. Each maps to a CLI subcommand, an MCP tool, and a `TaskBackend` method, so the same human request behaves identically regardless of backend:

| Operation | Human asks the agent to… | CLI | MCP tool | `TaskBackend` method | File backend | Git-native backend |
| --- | --- | --- | --- | --- | --- | --- |
| `create` | add a task | `tasks create` | `add_task` | `create()` | append to the priority section | append a `created` event |
| `update` | change a task's fields | `tasks update` | `enrich_task` | `update()` | edit the task block | append an `updated` event |
| `review` | list / reprioritize / groom | `tasks list` | `list_tasks` | `listOpen()` | read the file | read `fold(log)` |
| `claim` | take a task | `tasks claim` | `claim_task` | `claim()` | append `(@agent)` (best-effort) | append a `claimed` event behind a ref-CAS (collision-free) |
| `release` | give a claimed task back | `tasks unclaim` | `unclaim_task` | `release()` | remove `(@agent)` | append a `released` event |
| `complete` | finish a task | `tasks complete` | `complete_task` | `complete()` | remove the block | append a `completed` event |
| `cancel` | drop a task without doing it | `tasks cancel` | `cancel_task` | `cancel()` | remove the block (reason in the commit) | append a `cancelled` event |
| `render` | materialize the human-readable snapshot | `tasks render` | — | `render()` | no-op (the file is the surface) | regenerate `TASKS.md` = `fold(log)` |

`create`, `claim`, `complete`, and `review`/`list` are implemented today; `update`, `release`, `cancel`, and `render` land with the agent-owned backend protocol (the `TaskBackend` reshape) — this table is the contract that implementation follows (G1). Backends that cannot perform an operation (for example, `render` against the file backend) return an actionable unsupported result rather than silently succeeding.

**Canonical commands vs. operations.** To keep the surface thin (G6), only `setup`, `next-task`, and `lint-tasks` are canonical command files under [`commands/`](commands/) (generated per-agent, G2). The eight operations above are CLI subcommands and MCP tools the agent calls from within those commands — they are *not* given one command file each. A `setup` command installs the workflow; `next-task` reads, claims, and completes; `lint-tasks` verifies. Adding, updating, or reviewing tasks is something the agent does inline (via the operation) when a human asks, not a separate per-verb command.

**Verification after a mutation.** Whichever operation an agent runs, it confirms the result before reporting done:

- **File backend** — `npx -y @tasks-md/lint TASKS.md` exits 0 (the file is the state, so lint is the check).
- **Git-native backend** — the appended event folds into the expected state and `render()` is byte-idempotent for that log (see [Fleet coordination](#fleet-coordination)); a stale generated `TASKS.md` snapshot is cosmetic and never blocks the operation.

## Fleet coordination

The **git-native backend** turns a single git repository into a collision-free task queue for a *fleet*: a team of machines, each running a parallel set of agents, all working one queue (VISION.md G7). It is an opt-in backend; the file backend (best-effort `(@agent)` claims) stays the zero-setup default and is **not** collision-free.

The guarantee is **collision-freedom** — no two agents ever hold the same task at once — not a globally reproducible schedule. Selection is deterministic for a given state snapshot, but the *winner of a race* is whoever the remote accepts first; only the **fold of the log** is reproducible.

### Source of truth: an append-only event log

Git-native task state lives in an **append-only event log** on a dedicated `tasks-claims` ref (default branch `tasks-claims`), not in `TASKS.md`:

- The log is the **sole source of truth** for every task's existence, fields, claim, and lifecycle.
- `TASKS.md` on the default branch is a **single-writer generated snapshot** = `fold(log)`. Agents never hand-edit it in git-native mode, so it cannot cause merge conflicts. Staleness is cosmetic: agents pick from the folded log, never from the file.
- The `tasks-claims` ref is **excluded from normal CI** (build/test pipelines ignore it); only the projection and claim-check workflows read it.

### Event schema

Each event is a JSON object stored as one file per event at `events/<event_id>.json` on the `tasks-claims` ref. A commit carries exactly **one** event — single-event commits keep merges and fences simple. Fields, in canonical order:

| Field | Type | Rule |
| --- | --- | --- |
| `schema_version` | integer | Current version is `1`. An unknown version is ignored by the fold (forward-compatible) and reported by `tasks doctor`. |
| `event_id` | string | Globally unique, e.g. `evt-<uuid>`. Duplicate `event_id`s: the fold keeps the first and ignores the rest. |
| `task_id` | string | The kebab-case task ID the event applies to. |
| `event_type` | string | One of `created`, `updated`, `claimed`, `released`, `completed`, `cancelled`. |
| `actor_id` | string | The acting identity (see Actor identity), normalized by stripping a leading `@`. |
| `instance_id` | string | Distinguishes concurrent agents of the same actor; `<actor-id>/<instance-id>` is globally unique. |
| `created_at` | string | RFC 3339 / ISO 8601 UTC timestamp. Used for display and lease math only — never as the race tiebreaker (git ref-CAS decides the winner). |
| `parent_event_ids` | string[] | Causal parents; `[]` under linear-CAS v1. Reserved for a future CRDT engine. |
| `payload` | object | Event-type-specific data (below). |

Serialization is canonical: `JSON.stringify(event, null, 2)` with a trailing newline and keys in the order above. A **malformed event** (invalid JSON, missing required field, unknown `event_type`, or `schema_version !== 1`) is **skipped** by the fold rather than aborting it, so one bad commit cannot poison the queue.

Payloads by type:

- `created` — `{ title, priority, tags, body }`.
- `updated` — the changed fields only (`{ title?, priority?, tags?, body? }`).
- `claimed` — `{ claim_id, lease_expires? }`; `claim_id` is a unique fencing token (e.g. `claim-<uuid>`) minted by the winner.
- `released` — `{ claim_id }`.
- `completed` — `{ claim_id? }`.
- `cancelled` — `{ reason? }`.

### Folding the log

`fold(log)` replays events in ref order: `created` introduces a task; `updated` patches its fields; `claimed` sets the owner + `claim_id` when the task is open; `released` clears the owner when it matches; `completed`/`cancelled` close the task (drop it from the open queue). The fold is **deterministic and idempotent** — the same log always produces the same open-task set and the same rendered `TASKS.md` bytes.

### Claim lifecycle (collision-free)

1. **Claim.** Append a `claimed{ claim_id, lease_expires }` event and push the `tasks-claims` ref. **Git's atomic non-fast-forward rejection is the collision-free primitive**: if two agents claim the same task, exactly one push fast-forwards (the winner); the loser is rejected, fetches the ref, sees the live claim, and **yields → picks the next task**. Retries are silent with bounded backoff + jitter.
2. **Fencing token.** A successful claim returns its `claim_id`. Work commits carry `Task: <task-id>` and `Task-Claim: <claim_id>` trailers (written/parsed with `git interpret-trailers`). A resurrected stale owner cannot clobber a new owner — its `claim_id` no longer matches the live claim.
3. **Release.** A `released` event returns the task to the open queue.
4. **Lease expiry.** A claim carries `lease_expires`; once past, another agent may steal the task via the same CAS. v1 uses a long lease as a dead-owner backstop; heartbeats/short leases are a later phase.
5. **Completion / cancellation.** `completed` and `cancelled` close the task and remove it from the snapshot.

### Generated `TASKS.md` projection

A single scheduled job regenerates `TASKS.md` from the log:

- **Trigger** — on push to the `tasks-claims` ref, plus a periodic fallback.
- **Single writer** — only this job writes `TASKS.md`, so there are never competing edits. A concurrency group serializes runs; the latest fold wins.
- **One branch, one PR** — it updates a stable projection branch and reuses one PR. Because the change touches only `TASKS.md` (markdown), it passes the path-scoped claim check by the same rule that passes any docs-only change — no per-actor CI bypass.
- **No loop** — the regeneration commit lands on the default branch, not on `tasks-claims`, so it never re-triggers itself.
- **Idempotent** — re-folding the same log yields identical bytes; a failed run is safely re-run.

### Actor identity and privacy

Identity is `<actor-id>/<instance-id>`. `actor-id` defaults to a configured handle or platform login; **a raw git email is never rendered into a public snapshot unless the operator explicitly opts in**. The rendered `TASKS.md` shows the privacy-safe `actor-id` (e.g. `@alice` or a configured handle), not an email.

### File backend vs. git-native

| | File (`tasks-md`) | Git-native |
| --- | --- | --- |
| Source of truth | `TASKS.md` (human-editable) | `tasks-claims` event log |
| `TASKS.md` | the surface | generated snapshot (never hand-edited) |
| Claims | best-effort `(@agent)` suffix | collision-free `claimed` event behind ref-CAS |
| Concurrency | races possible | collision-free |
| Setup | none | `tasks fleet init` |

The file backend stays valid and zero-setup; git-native is the opt-in path for fleets. The two never contradict because each owns its own source of truth.

### Migrating from the file backend

The file backend is the v1-compatible default; git-native is an explicit opt-in. A repo moves to git-native with `tasks migrate`, which imports the current `TASKS.md` snapshot into `created` (and `claimed`, for tasks carrying an `(@agent)` suffix) log events, **preserving task ids, priority, tags, and details**. It is a **dry-run by default** — it prints the events it would append and the `.tasksmd.json` it would write — and applies only with `--apply`. Duplicate or missing ids abort before any write. Rollback is `rm .tasksmd.json` plus `git update-ref -d refs/heads/tasks-claims`; the original `TASKS.md` is never modified by the migration.

### Security model

The `tasks-claims` ref, the generated snapshot PR, the claim-check CI, and the local hooks are security boundaries. v1 enforcement is a **bypassable** client `pre-push` hook; the unbypassable guarantee is the Phase 3 server-side required check. The full trust boundaries, threats, mitigations, CI guidance (use `pull_request`, never `pull_request_target`), and per-platform token scopes are in [`docs/security/git-native-claims-threat-model.md`](docs/security/git-native-claims-threat-model.md). v1 does not claim to be unbypassably secure.

> **Status.** The git-native event log, fold, claim-via-CAS, and snapshot rendering are implemented in the reference CLI (`@tasks-md/cli`). Robust leases/heartbeats, the projection job, and server-side enforcement are phased — see the active [`TASKS.md`](TASKS.md) queue and [`docs/plans/deterministic-fleet-claiming.md`](docs/plans/deterministic-fleet-claiming.md).

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
