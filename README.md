# TASKS.md

[![CI](https://github.com/tasksmd/tasks.md/actions/workflows/ci.yml/badge.svg)](https://github.com/tasksmd/tasks.md/actions/workflows/ci.yml)
[![npm @tasks-md/parser](https://img.shields.io/npm/v/@tasks-md/parser?label=parser)](https://www.npmjs.com/package/@tasks-md/parser)
[![npm @tasks-md/lint](https://img.shields.io/npm/v/@tasks-md/lint?label=lint)](https://www.npmjs.com/package/@tasks-md/lint)
[![npm @tasks-md/cli](https://img.shields.io/npm/v/@tasks-md/cli?label=cli)](https://www.npmjs.com/package/@tasks-md/cli)
[![npm tasks-mcp](https://img.shields.io/npm/v/tasks-mcp?label=mcp)](https://www.npmjs.com/package/tasks-mcp)

A lightweight spec for AI agent task queues — the companion to [AGENTS.md](https://agents.md/).

**[Website](https://tasksmd.github.io/tasks.md/)** · **[Spec](spec.md)** · **[Examples](examples/)** · **[MCP Server](packages/mcp/)** · **[Linter](packages/lint/)**

AGENTS.md tells agents *how* to work. TASKS.md tells them *what* to work on.

## Quick Start

Create a `TASKS.md` at your repo root:

```markdown
# Tasks

<!-- policy: Run tests before every commit. Prefer fixing root causes over symptoms. -->

## P0

- [ ] Fix authentication crash on token refresh
  - **ID**: auth-fix
  - **Details**: JWT refresh returns 500 on expired tokens
  - **Files**: `src/auth/refresh.ts`, `src/middleware/auth.ts`
  - **Acceptance**: Refresh works, tests pass, regression test added

## P1

- [ ] Add rate limiting to public API endpoints
  - **Blocked by**: auth-fix
- [ ] Migrate database queries to prepared statements

## P2

- [ ] Update README with new API endpoints
```

Most tasks are just checkboxes under priority headings. Tasks with dependencies get an **ID** so blockers can reference them stably. All metadata is optional.

Then add this to your `AGENTS.md` so agents know to use it:

```markdown
## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-name) before starting work
- Remove completed tasks from the file (history is in git log)
```

That's it. Your agent will read TASKS.md on session start and work through the queue.

## Why TASKS.md?

**You think faster than agents can code.** Ideas come in bursts — while an agent implements one feature, you've already thought of three more. Without a queue, those ideas live in your head or scatter across chat windows. TASKS.md is your buffer: write tasks down as they come, and agents work through them at their own pace.

**Planning first leads to better results.** When you write a task down — even a one-liner — you're forced to think about what you actually want before the agent starts coding. That small act of planning is the difference between an agent that builds the right thing and one that guesses. TASKS.md makes planning the natural first step, not an afterthought.

**Zero friction beats any tool.** Opening Jira to write a task takes you out of flow — you switch context, fill in fields, pick a project, assign a sprint. With TASKS.md, you add a line to a file that's already open in your editor. The lower the friction, the more likely you are to actually write tasks down — and written tasks are the whole point.

**One Markdown file that any tool can read and write:**

- **Zero setup** — No accounts, no APIs, no tokens. Create a file and start writing.
- **In your editor** — Add tasks without leaving your IDE. No browser tab, no context switch.
- **Version-controlled** — In git, next to the code. Every change is tracked.
- **Agent-native** — LLMs parse Markdown natively. No API client needed to read a file.
- **Vendor-neutral** — Works with any agent, any IDE, any CI system, today.
- **Offline** — Works on a plane. No server required.

## How It Works

1. **Plan** — Write tasks under P0–P3 priority headings as ideas come to you
2. **Delegate** — Agent reads the file, claims a task with `(@agent-name)`, implements it
3. **Remove** — Completed tasks are deleted from the file; history lives in git log
4. **Repeat** — You keep adding tasks while agents keep working through them

You're always adding to the queue; agents are always draining it. No ideas get lost, and agents never run out of work.

## Writing Good Tasks

The quality of your task description directly affects the quality of the agent's output. A task is a small contract between you and the agent — the more specific you are, the better the result.

**A one-liner is fine for obvious work:**

```markdown
- [ ] Add input validation to the /users endpoint
```

**Add metadata when the task needs context:**

```markdown
- [ ] Fix race condition in WebSocket reconnect
  - **Details**: When the server restarts, clients reconnect but sometimes
    miss messages sent during the reconnect window. Add a sequence number
    to messages and request missed messages after reconnecting.
  - **Files**: `src/ws/client.ts`, `src/ws/server.ts`
  - **Acceptance**: No dropped messages during server restart in integration test
```

**Tips for writing tasks agents can actually complete:**

- **One session, one task** — If it takes you more than a sentence to describe, it might be two tasks
- **Include file paths** — Agents explore faster when they know where to look
- **Define "done"** — An **Acceptance** field turns a vague ask into a testable outcome
- **Use IDs for dependencies** — If task B depends on task A, give A an **ID** and add `**Blocked by**: task-a` to B. The agent will skip B until A is gone.

## The Format

**Priority**: `## P0` through `## P3` — a widely-used scale (PagerDuty, Google SRE). P0 is "drop everything", P3 is "nice to have".

**Tasks**: Markdown checkboxes (`- [ ]`). Each task should be completable in a single agent session.

**IDs**: `**ID**: kebab-case` — stable identifiers for tasks that other tasks depend on. Don't rename once assigned.

**Blockers**: `**Blocked by**: auth-fix, rate-limit` — references task IDs across all files. A task is unblocked when the referenced IDs no longer exist in any file.

**Blocked for a reason**: `**Blocked**: needs-user-approval — ...` — free-form text for blocks that aren't another task. Use it when the agent can't complete the task without an external change (missing approval, refused policy, missing credentials). Any non-empty value marks the task as blocked; the lint keeps the reason field from going empty. Agents running `/next-task` add this field themselves when they detect an action that is blocked by default (see [Refuse forbidden work](#what-it-does)). See [the spec](spec.md#blocked-for-a-reason) for details.

**Research / Last-enriched**: `**Research**: <notes>` + `**Last-enriched**: YYYY-MM-DD` — agent-managed fields for research notes accumulated while the task is blocked. When `/next-task` runs on a queue where every task is blocked, it spends the turn adding read-only research (drafted message text, file paths, consumer sketches) to the task's **Research** field and stamps **Last-enriched** so the next session knows how fresh the notes are. Enrichment never touches the block itself — only the metadata around it. See [Enriching blocked tasks](spec.md#enriching-blocked-tasks) in the spec.

**Plan / Parent**: `**Plan**:` + `**Parent**: task-id` — agent-managed fields for complex-task planning and decomposition. `/next-task` adds a **Plan** checklist before coding on multi-file or architectural tasks, and uses **Parent** when splitting a large task into smaller top-level tasks. Users do not need to add either field manually.

**Tags**: `**Tags**: backend, auth` — lowercase labels for filtering and routing to specialized agents.

**Metadata**: Optional nested fields — **ID**, **Tags**, **Details**, **Files**, **Acceptance**, **Plan**, **Blocked by**, **Blocked**, **Parent**, **Research**, **Last-enriched**. Teams can add custom fields beyond these supported fields.

**Sub-tasks**: Nested checkboxes under a parent. The agent who claims the parent owns all sub-tasks. Remove the entire block when done. Use sub-tasks when steps are sequential and owned by one agent; promote to separate top-level tasks when steps can be parallelized or span multiple sessions.

**Multiple files**: One root `TASKS.md` for small repos. Subdirectory files for monorepos. Split when a file exceeds ~50 tasks.

**Policies**: Project rules embedded in HTML comments that agents follow when picking and executing tasks. Use `<!-- policy: ... -->` between `# Tasks` and the first section for file-wide rules, or after a `## P*` heading for section-scoped rules. Policies are invisible in rendered Markdown but readable by agents. See the [spec](spec.md#policies) for details.

See the [full specification](spec.md) for all rules and edge cases.

## Examples

- [Web application](examples/web-app.md)
- [CLI tool](examples/cli-tool.md)
- [Monorepo](examples/monorepo.md)
- [Multi-agent workflow](examples/multi-agent.md)
- [Complex tasks](examples/complex-tasks.md) — multiline details, rich acceptance criteria, sub-tasks with metadata
- [Python API](examples/python-api.md) — FastAPI with SQLAlchemy, pytest, mypy, ruff
- [Rust CLI](examples/rust-cli.md) — Cargo project with clippy, assert_cmd, crates.io publishing
- [Mobile app](examples/mobile-app.md) — React Native with biometrics, offline sync, Detox E2E

## The `/next-task` Command

The most useful thing about TASKS.md is a single command: "pick the next task and do it." Install the command for your agent, then type `/next-task` to start an autonomous work loop or `/next-task <task-id>` to work one exact task.

### Install

Auto-detect your agents and install the command:

```bash
npx @tasks-md/cli install
```

Or copy manually into your project (commit it so your team gets it too):

| Agent | Install |
|-------|---------|
| Claude Code | `cp -r commands/claude/skills/next-task .claude/skills/` |
| Codex | `cp -r commands/codex/skills/next-task .agents/skills/` |
| Cursor | `cp commands/cursor/next-task.md .cursor/commands/` |
| Devin | `cp -r commands/devin/skills/next-task .devin/skills/` |
| Gemini CLI | `cp commands/gemini/next-task.toml .gemini/commands/` |
| Windsurf | `cp commands/windsurf/next-task.md .windsurf/workflows/` |

All paths are **project-local** (inside your repo). See [commands/](commands/) for source files and format details.

### Queue entry modes

| Mode | Use when | Example |
|------|----------|---------|
| Queue pick | You want the agent to drain the highest-priority actionable work | `/next-task` |
| Targeted task | You know the exact task ID to run or resume | `/next-task auth-fix` |
| Standing audit loop | You want an audit-only pass that adds follow-up tasks without fixing them immediately | `/next-task standing-audit-gap-loop` |

The standing audit loop is a standard compact task pattern: give it
`**ID**: standing-audit-gap-loop`, `**Tags**: standing-loop, audit, queue`,
and put repo-specific inputs in `**Details**:` / `**Files**:`. The agent reads
that brief, audits the repo, adds or refines TASKS.md items, removes the
standing-loop task, commits, and stops. See
[Standing audit loops](spec.md#standing-audit-loops) for the full template.

### What it does

When you type `/next-task` or `/next-task <task-id>`, the agent runs this flow:

1. **Stop check** — Runs `scripts/check-zero-ship-streak.mjs` if the repo ships it and exits immediately on `STOP` output. Catches exhausted audit cascades (last 3 commits on `origin/master` were docs-only with no `closes <task-id>`) and fully-blocked queues (100% of tasks marked with non-empty `**Blocked**` metadata) before wasting a session on busywork
2. **Snapshot** — Reads git status, current branch, and TASKS.md in one shot to orient without redundant tool calls
3. **Preserve** — If the worktree is dirty, keeps existing edits in place, avoids them when possible, and stages only its own hunks when it must touch a shared file
4. **Tidy** — Merges ready PRs, closes stale ones, deletes merged branches, pulls main
5. **Find** — Discovers all `TASKS.md` files from the git root down
6. **Policies** — Reads `<!-- policy: ... -->` comments from the file and follows them as project rules throughout the session
7. **Target (optional)** — If a task ID follows the command, trims it and searches for an exact `**ID**:` match. Missing, duplicate, claimed-by-another-agent, and blocked targets are reported and stop the run; actionable targets bypass priority ordering but still go through policies, safety checks, verification, and task-block removal. After shipping a targeted task, including `standing-audit-gap-loop`, the agent stops instead of draining unrelated queue items.
8. **Resume** — Checks for a previously claimed task (`(@agent-id)`) and picks up where it left off
9. **Pick** — Without a target ID, selects the highest-priority unblocked, unclaimed task. Skips tasks with `**Blocked by**:` whose dependencies aren't resolved and tasks with a non-empty `**Blocked**:` reason. Prefers tasks that unblock others (impact-first) and harder tasks over simpler ones
10. **Refuse forbidden work** — Before claiming, checks whether the task requires a blocked-by-default action (posting in Slack / Teams / Discord, creating or commenting on Jira or GitHub issues, publishing packages, sending emails, pushing to protected branches, etc.). If so, adds `**Blocked**: <reason>` to the task with a short code like `needs-user-approval` and moves on. In targeted mode, it stops after committing the block. Opening pull requests with `gh pr create`, reading dashboards, and local-only actions stay allowed by default.
11. **Enrich blocked tasks** — When every remaining task is blocked and none has been enriched in the last 7 days, spends the turn on read-only research. Reads the task's `**Files**:`, greps the codebase for related terms, drafts the exact Slack/Jira/PR-review text when applicable, and appends findings to the task's `**Research**:` field (plus `**Files**:` / `**Acceptance**:` when warranted). Stamps `**Last-enriched**: YYYY-MM-DD` so future sessions can tell how fresh the notes are. Never touches `**Blocked**:` or `**Blocked by**:` — enrichment leaves context behind, it doesn't unblock.
12. **Plan** — For complex tasks (multi-file, architectural, > 1 hour), explores the code and writes a `**Plan**:` sub-task checklist into the task block before touching any code
13. **Claim** — Appends `(@agent-id)` to the task line so other agents skip it
14. **Work** — Reads the task's metadata, checks AGENTS.md for project conventions, makes changes, runs tests
15. **Scout** — While working, actively looks for bugs, missing tests, stale docs, and other gaps in code it touches — records them as new tasks in TASKS.md so the queue grows smarter with every completed task
16. **Complete** — Removes the entire task block from TASKS.md, commits, pushes
17. **Loop** — In queue mode, returns to step 5 and picks the next task until the queue is empty
18. **Roam** — When the current repo's queue is empty and every blocked task is freshly enriched, scans `~/apps/*/TASKS.md` for work in other repos and switches automatically
19. **Audit** — When ALL repos are empty, runs a 5-tier cascade on the current repo:
    - Tier 1: Verify (typecheck, lint, test, build)
    - Tier 2: Security & dead code
    - Tier 3: Doc drift & stale references
    - Tier 4: Dependency modernization (universal — works for any repo type)
    - Tier 5: DX polish (help text, error messages, onboarding friction)
    - Writes findings as tasks and implements the first one — re-runs on each invocation
20. **Terminal** — When all repos are clean across all 5 tiers, prints a summary and stops the loop cleanly

### The workflow

```
You                              Agent
──────────────────               ──────────────────
Write tasks as ideas come  →     /next-task or /next-task <task-id>
Add more tasks             →     Claims P0 task, starts working
Add more tasks             →     Completes task, picks next one
Review agent's commits     ←     Commits, removes task, loops
Add more tasks             →     ...keeps draining the queue
```

You're always adding to the queue. The agent is always draining it. This is the core loop — planning is your job, execution is the agent's.

## Taskgrind — overnight / 24h autonomous sessions

For unsupervised runs longer than a single coding session, the
`/next-task` loop alone isn't enough. Without guardrails, agents
eventually find micro-doc-drift to "fix" once the real queue is
exhausted, generate single-finding PRs, exceed admin-merge volume on
shared branches, and ignore orchestrator stop signals.

[`taskgrind/`](taskgrind/) provides a canonical rule set + 4
enforcement scripts that prevent these failure modes:

| File | What it does |
|---|---|
| [`prompt-template.md`](taskgrind/prompt-template.md) | 10 hard rules — copy to your repo's `taskgrind.md`, fill in placeholders |
| [`scripts/check-zero-ship-streak.mjs`](taskgrind/scripts/check-zero-ship-streak.mjs) | Pre-flight `STOP`/`CONTINUE` check — already wired into the `next-task` skill |
| [`scripts/check-admin-merge-rate.mjs`](taskgrind/scripts/check-admin-merge-rate.mjs) | Counts admin self-merges in trailing 24h, exits non-zero at ≥5 |
| [`scripts/safe-admin-merge.sh`](taskgrind/scripts/safe-admin-merge.sh) | Wrapper around `gh pr merge --admin` that runs the rate check first |
| [`scripts/lint-pr-shape.mjs`](taskgrind/scripts/lint-pr-shape.mjs) | CI gate — refuses single-finding doc-only PRs without `closes <task-id>` |

See [`taskgrind/README.md`](taskgrind/README.md) for adoption options
(copy / symlink / future npx) and the lessons that motivated each
rule.

## Tooling

### CLI

The [`@tasks-md/cli`](packages/cli/) provides task queue management — pick tasks, lint files, sync from issue trackers, and install agent commands.

```bash
npx @tasks-md/cli pick                       # pick highest-priority unblocked non-standing task
npx @tasks-md/cli init                       # create TASKS.md in current repo
npx @tasks-md/cli install                    # install /next-task for detected agents
npx @tasks-md/cli stats                      # queue overview and throughput
npx @tasks-md/cli lint TASKS.md              # validate against spec
npx @tasks-md/cli sync github --merge        # sync GitHub Issues into TASKS.md
npx @tasks-md/cli sync jira --project PROJ   # also: tasks sync linear --team ENG
```

### MCP Server

The [`tasks-mcp`](packages/mcp/) server lets any MCP-compatible agent manage TASKS.md files programmatically — list, pick, target exact IDs, claim, unclaim, complete, and add tasks without file parsing.

Use `pick_task` for both queue mode and targeted mode. With no `task_id`, it walks P0→P3 and returns the best unblocked, unclaimed task using the same auto-pick rules as the CLI, including skipping `standing-loop` tasks. With `task_id`, it bypasses queue ordering, looks for one exact `**ID**`, and returns a structured status for `missing`, `duplicate`, `already_claimed`, `blocked`, `ready`, `resumed`, or `claimed`. Pass `agent_name` to claim an actionable target or resume a target already claimed by that same agent. This composes with `/next-task <task-id>` and standing loops like `standing-audit-gap-loop` without custom file parsing.

```json
{
  "mcpServers": {
    "tasks": {
      "command": "npx",
      "args": ["tasks-mcp"]
    }
  }
}
```

### Linter

The [`@tasks-md/lint`](packages/lint/) CLI validates TASKS.md files against the spec — checks structure, priority ordering, ID format, duplicate IDs, dangling blocker references, and tag casing. Directory targets include direct `.md` files and nested `TASKS.md` files for monorepos.

```bash
npx @tasks-md/lint TASKS.md           # lint one file
npx @tasks-md/lint TASKS.md examples/ # lint multiple files/directories
npx @tasks-md/lint --fix TASKS.md     # auto-fix (removes completed tasks)
```

### GitHub Action

Add one line to your CI workflow to validate TASKS.md on every push:

```yaml
- uses: tasksmd/tasks.md/.github/actions/lint@main
```

See [.github/actions/lint/](.github/actions/lint/) for options.

## FAQ

### Why not Jira / GitHub Issues / Linear?

They solve a different problem. Issue trackers are for **team coordination** — prioritizing features, tracking sprints, assigning across people, reporting to stakeholders. TASKS.md is for **agent execution** — a local, fast, file-based queue that agents read and write without API calls.

Key differences:

| | Issue trackers | TASKS.md |
|--|----------------|----------|
| **Audience** | Product managers, teams | Agents, solo devs |
| **Granularity** | Features, bugs, epics | Implementation steps |
| **Access** | API calls, auth tokens | Read a file |
| **Speed** | Browser/API round-trip | Edit a line in your editor |
| **Works offline** | No | Yes |
| **Agent can write** | Needs API client + auth | Append to a file |
| **Git-native** | Separate system | Same repo, same PR |

They complement each other — one Jira ticket or GitHub Issue often becomes multiple TASKS.md entries. Use the tracker for *what* to build; use TASKS.md for *how* the agent builds it.

### Can I use TASKS.md alongside Jira / GitHub Issues?

Absolutely — that's the expected setup for teams. The issue tracker is your source of truth for product work. When you pick up an issue, break it into implementation steps in TASKS.md and let the agent execute them. The agent doesn't need access to your tracker; it just needs the file.

```markdown
## P1

- [ ] Implement user profile page (PROJ-142)
  - **Details**: See Jira PROJ-142 for designs. Build the profile
    page with avatar, bio, and settings link.
  - **Files**: `src/pages/profile.tsx`, `src/api/user.ts`
  - **Acceptance**: Page renders, matches Figma, tests pass
```

### Why not TODO.md?

`TODO.md` has no spec and thousands of incompatible formats in the wild. A "todo list" is a human wish list; a "task queue" is an active work queue for agents. The naming fits the emerging pattern: `AGENTS.md` (instructions), `TASKS.md` (work queue).

Migration: `mv TODO.md TASKS.md`, add P0–P3 headings, convert to checkboxes.

### Do I need an orchestrator?

No. A solo developer with one agent benefits from persistent context across sessions. You write tasks, the agent works through them. An orchestrator helps when you have multiple agents, but it's not required. TASKS.md is intentionally simple enough that any agent can use it without special tooling.

### Won't deleting tasks cause merge conflicts?

Each agent claims a unique task (different line). Git auto-merges deletions on non-adjacent lines. Conflicts are rare and trivial.

### How detailed should my tasks be?

As detailed as needed for the agent to succeed without asking you. A one-liner works for obvious changes (`Add input validation to /users`). For anything ambiguous, add **Details**, **Files**, and **Acceptance** so the agent knows what to do, where to look, and when it's done.

### Can I use TASKS.md without AI agents?

Yes. It works as a personal backlog for any developer. The format is just prioritized Markdown checkboxes — you don't need an agent to benefit from writing tasks down before starting work. The planning habit alone improves outcomes.

### How do I handle tasks that are too big for one session?

**Default to sub-tasks** — nested checkboxes that one agent works through sequentially. Sub-tasks keep context (Details, Acceptance) in one place and show progress without cluttering the queue.

**Promote to separate top-level tasks** when steps can be parallelized, span multiple sessions, or each produce a shippable artifact on their own. Use `**Blocked by**:` to express the dependency:

```markdown
- [ ] Set up auth database schema
  - **ID**: auth-schema

- [ ] Implement JWT token refresh
  - **Blocked by**: auth-schema
```

Decision rule: can one agent finish everything in a single session? Use sub-tasks. Does any step need a different agent or could it ship alone? Separate tasks.

### What happens when an agent gets stuck?

The agent should tell you it's stuck and move on to the next task. The stuck task stays in the queue with its `(@agent-id)` claim. You can either add more detail to help the next attempt, or remove the claim so another agent (or a fresh session) can try.

### Can multiple agents work on the same TASKS.md?

Yes — that's what the claiming mechanism is for. Each agent appends `(@agent-id)` to the task it picks up. Other agents see the claim and skip to the next unclaimed task. In multi-agent setups, agents should commit and push claims immediately to avoid races.

### Should I keep completed tasks in the file?

No. Remove them. Git log is your history. Keeping completed tasks in the file adds noise and makes it harder for agents to scan the queue. The spec enforces this — `@tasks-md/lint` will flag checked-off tasks as errors.

### How does TASKS.md relate to AGENTS.md?

They're companions. AGENTS.md tells agents how your project works (build commands, conventions, architecture). TASKS.md tells agents what to work on (prioritized queue). Together, an agent can start a session, read both files, and be immediately productive — no human prompting needed.

## See Also

- [Why Your AI Agent Needs a Backlog](docs/blog/why-your-ai-agent-needs-a-backlog.md) — the motivation behind TASKS.md
- [AGENTS.md](https://agents.md/) — the companion spec for agent instructions
- [Proposal: TASKS.md as a companion standard](https://github.com/agentsmd/agents.md/issues/166) — discussion on the agents.md repo

## Releasing

All four npm packages share a single version and are published together:

| Package | npm |
|---------|-----|
| [`@tasks-md/parser`](packages/parser/) | [![npm](https://img.shields.io/npm/v/@tasks-md/parser)](https://www.npmjs.com/package/@tasks-md/parser) |
| [`@tasks-md/lint`](packages/lint/) | [![npm](https://img.shields.io/npm/v/@tasks-md/lint)](https://www.npmjs.com/package/@tasks-md/lint) |
| [`@tasks-md/cli`](packages/cli/) | [![npm](https://img.shields.io/npm/v/@tasks-md/cli)](https://www.npmjs.com/package/@tasks-md/cli) |
| [`tasks-mcp`](packages/mcp/) | [![npm](https://img.shields.io/npm/v/tasks-mcp)](https://www.npmjs.com/package/tasks-mcp) |

### How to release

1. Go to [GitHub Releases → New](https://github.com/tasksmd/tasks.md/releases/new)
2. Create a new tag with a `v` prefix (e.g. `v0.3.1`) targeting `main`
3. Add release notes (GitHub can auto-generate them)
4. Click **Publish release**

Or from the CLI:

```bash
gh release create v0.3.1 --generate-notes
```

The [publish workflow](.github/workflows/publish.yml) runs automatically and:
1. Syncs all `package.json` versions to match the tag
2. Builds and runs the full test suite
3. Publishes all 4 packages to npm in dependency order
4. Commits the version bump back to `main`

### Setup (one-time)

The workflow requires an `NPM_TOKEN` secret:

1. Create an npm **Automation** token at [npmjs.com/settings → Access Tokens](https://www.npmjs.com/settings/) (automation tokens bypass 2FA/OTP)
2. Add it as a repository secret named `NPM_TOKEN` at [Settings → Secrets → Actions](https://github.com/tasksmd/tasks.md/settings/secrets/actions)

### Manual publishing

If you need to publish without a GitHub Release (e.g. from a local machine):

```bash
npm adduser                        # authenticate once
scripts/sync-versions.sh 0.3.1    # bump all package versions
scripts/publish-all.sh             # publish in dependency order (requires OTP)
```

## Contributing

We track work in our own [TASKS.md](TASKS.md). Contributions welcome:

- Improve the [specification](spec.md)
- Add [examples](examples/) for your stack
- Add or improve [agent commands](commands/) for your tool
- Report bugs or suggest features via [GitHub Issues](https://github.com/tasksmd/tasks.md/issues)

## License

[MIT](LICENSE)
