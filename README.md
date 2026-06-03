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

### One prompt (recommended)

Paste this into whatever agent you use (Claude Code, Cursor, Devin, Codex, Gemini CLI, Windsurf) and it does the rest — creates `TASKS.md`, merges the `## Task Management` section into `AGENTS.md`, installs its own `/next-task` command, verifies, and reports:

```text
Set up tasks.md in this repo. Create TASKS.md if missing, add the "## Task Management"
section to AGENTS.md (don't duplicate it), install the /next-task command for yourself,
then verify with `npx -y @tasks-md/lint TASKS.md` and tell me what you did. If npx/Node
isn't available, write the files directly from https://github.com/tasksmd/tasks.md.
```

It's idempotent (safe to re-run — it merges, never clobbers) and works with or without Node (`tasks init` + `tasks install --agent <you>` when `npx` is present; a direct file-write fallback otherwise). The canonical steps live in [`commands/setup.md`](commands/setup.md), generated into a `/setup` command for all six agents. For a **fleet** (a team of machines × parallel agents on one queue), the agent can also run `tasks fleet init` to switch to the collision-free [git-native backend](spec.md#fleet-coordination).

### Manual

Or set it up by hand. Create a `TASKS.md` at your repo root:

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

## Worked example: first 10 minutes

Nine commands take a fresh repo from zero to a queue an agent can pick from. Output snippets below are real (`tasks` here is `npx -y @tasks-md/cli` — `npm install -g @tasks-md/cli` once to drop the `npx -y` prefix).

1. **Bootstrap a project.**
   ```bash
   mkdir my-project && cd my-project && git init -q
   echo "# README" > README.md && git add README.md && git commit -m "feat: init"
   ```

2. **Scaffold the queue** — `tasks init` writes `TASKS.md` and merges a `## Task Management` section into `AGENTS.md` if present.
   ```bash
   touch AGENTS.md && npx -y @tasks-md/cli init
   ```
   Prints `✓ Created TASKS.md` and `✓ Added Task Management section to AGENTS.md`.

3. **Install the `/next-task` command for your agent** — auto-detects from agent dirs (`.claude/`, `.cursor/`, `.devin/`, etc.). See [story 3 → Auto-detect algorithm](docs/user-stories/03-agents-work-through-queue.md#auto-detect-algorithm) for the full table.
   ```bash
   npx -y @tasks-md/cli install
   ```

4. **Edit `TASKS.md`** — paste these two tasks under the existing priority headings:
   ```markdown
   ## P0

   - [ ] Fix the crash on startup
     - **ID**: fix-startup
     - **Details**: Service exits 1 when DATABASE_URL is missing.

   ## P1

   - [ ] Add request logging middleware
     - **Tags**: backend
   ```

5. **Pick the next task** — read-only inspection of what `/next-task` would claim.
   ```bash
   npx -y @tasks-md/cli pick
   ```
   ```
   Picked "Fix the crash on startup" (P0)
     File: TASKS.md:5
     ID: fix-startup
     Details:
       Service exits 1 when DATABASE_URL is missing.
     Candidates: 2
   ```

6. **Validate the queue against the spec.**
   ```bash
   npx -y @tasks-md/lint TASKS.md     # → Checked 1 file(s), found 0 error(s)
   ```

7. **Check queue health.**
   ```bash
   npx -y @tasks-md/cli stats
   ```
   ```
   📋 Queue Overview
     P0   P1   P2   P3   Total
     1    1    0    0    2
     Blocked: 0   Claimed: 0   Available: 2   Files: 1
   ```

8. **Commit, then look at queue changes since the last commit.**
   ```bash
   git add TASKS.md && git commit -m "chore: queue 2 items"
   echo "- [ ] Update README" >> TASKS.md
   npx -y @tasks-md/cli diff           # → ➕ Added (1): Update README
   ```

9. **Run the autonomous loop** — `/next-task` from inside your agent picks, claims, works, removes, and repeats. See [story 3](docs/user-stories/03-agents-work-through-queue.md) for the precise picking algorithm and [story 6](docs/user-stories/06-issue-tracker-flows-to-agents.md) when you want issues from GitHub / Jira / Linear feeding the queue automatically.

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

The contract is the same on every backend: **humans read the queue and tell agents what to do; agents (or tools) mutate task state.** In the default file backend the file *is* the surface, so hand-editing `TASKS.md` is the zero-setup path. In a generated backend the queue is a projection and an agent runs the operation — but the human's experience ("add a task", "mark it done") is unchanged.

## Backends

`TASKS.md` (local markdown) is the default, zero-infra backend. The same spec / parser / CLI / MCP surface can target another **backend** — switching is configuration in `.tasksmd.json`, never a migration ([`spec.md` § Task backends](spec.md#task-backends)):

| Backend | Capability | Use it when |
|---|---|---|
| **File** (`tasks-md`, default) | spec-compatible, offline, **human-editable** `TASKS.md`, best-effort claims | solo or offline — the zero-setup default |
| **Git-native** (recommended for shared repos) | spec-compatible, **collision-free** claims via git ref compare-and-swap; `TASKS.md` becomes a generated snapshot | **more than one writer**: a multi-contributor project, or a fleet of machines each running parallel agents on one queue ([Fleet coordination](spec.md#fleet-coordination)). Run `tasks fleet init` |
| **GitHub Issues** | spec-compatible, infra-required (a tracker) | a team already living in GitHub Issues |
| **Atomic queue / MCP broker** | server-backed | only where that infra already exists |

"Collision-free" means no two agents ever hold the same task at once — not a globally reproducible race winner; only the *fold of the log* is reproducible. Move an existing file queue to git-native with the **`/migrate` command** (or `tasks migrate --apply` then `tasks fleet init`) — it imports your current `TASKS.md` into the log first, so no task is lost. The portable layer is the spec; the coordination is borrowed. **This repo is being converted to git-native to dogfood it** (G8, tracked in [`TASKS.md`](TASKS.md)) — once flipped its `TASKS.md` is a generated snapshot, via the same path you'd run.

**Writing your own backend?** Any backend works behind the same surface if it passes the capability-scoped [`@tasks-md/conformance`](packages/conformance/) suite — implement a `ConformanceTarget`, run it, and publish the JSON report. tasks.md is not a backend registry; you self-certify which compatibility classes (file / operation / collision-free) you support.

## Workspaces (many repos, one queue)

Have a parent folder of repos that each carry a `TASKS.md`? Workspace mode picks the highest-priority unblocked task across all of them:

```bash
tasks next --workspace ~/apps/tooling          # one workspace
tasks next --workspaces ~/apps/tooling,~/apps/oncall-hub   # several
tasks workspaces add ~/apps/tooling --name tooling          # save to config
tasks next                                      # no flag → aggregate all configured
```

Declared workspaces live in `~/.config/tasks-md/workspaces.yaml`; once configured, plain `tasks next` aggregates across them and prints `<workspace>::<repo>:<task-id>`. Tasks can depend across repos (`**Blocked by**: api#fix`) or across workspaces (`**Blocked by**: oncall-hub::api#fix`). With no config and no flag, `tasks next` reads the local `./TASKS.md` as before. See [`spec.md` § Workspaces](spec.md#workspaces).

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
- **Pre-register the metric for non-trivial changes** — when a task is a feature, refactor, or non-cosmetic bugfix, write a **Hypothesis** (what observable will move and by how much), a **Success** / **Pivot** threshold, and a **Measurement** (the exact runnable command). This is the [rule-#9 pre-registration block](spec.md#rule-9-pre-registration-block); it prevents picking a flattering metric *after* seeing the result.

## The Format

**Priority**: `## P0` through `## P3` — a widely-used scale (PagerDuty, Google SRE). P0 is "drop everything", P3 is "nice to have".

**Tasks**: Markdown checkboxes (`- [ ]`). Each task should be completable in a single agent session.

**IDs**: `**ID**: kebab-case` — stable identifiers for tasks that other tasks depend on. Don't rename once assigned.

**Blockers**: `**Blocked by**: auth-fix, rate-limit` — references task IDs across all files. A task is unblocked when the referenced IDs no longer exist in any file.

**Blocked for a reason**: `**Blocked**: needs-user-approval — ...` — free-form text for blocks that aren't another task. Use it when the agent can't complete the task without an external change (missing approval, refused policy, missing credentials). Any non-empty value marks the task as blocked; the lint keeps the reason field from going empty. Agents running `/next-task` add this field themselves when they detect an action that is blocked by default (see [Refuse forbidden work](#what-it-does)). See [the spec](spec.md#blocked-for-a-reason) for details.

**Research / Last-enriched**: `**Research**: <notes>` + `**Last-enriched**: YYYY-MM-DD` — agent-managed fields for research notes accumulated while the task is blocked. When `/next-task` runs on a queue where every task is blocked, it spends the turn adding read-only research (drafted message text, file paths, consumer sketches) to the task's **Research** field and stamps **Last-enriched** so the next session knows how fresh the notes are. Enrichment never touches the block itself — only the metadata around it. See [Enriching blocked tasks](spec.md#enriching-blocked-tasks) in the spec.

**Plan / Parent**: `**Plan**:` + `**Parent**: task-id` — agent-managed fields for complex-task planning and decomposition. `/next-task` adds a **Plan** checklist before coding on multi-file or architectural tasks, and uses **Parent** when splitting a large task into smaller top-level tasks. Users do not need to add either field manually.

**Tags**: `**Tags**: backend, auth` — lowercase labels for filtering and routing to specialized agents.

**Estimate / Verification / Risk**: `**Estimate**: 2-3d` (free-form duration), `**Verification**: <runnable steps>` (procedure for confirming done — distinct from **Acceptance**, which is the criterion), `**Risk**: <what could go wrong>. Mitigation: <how>.` — author-managed fields that surface session-fit, the doneness procedure, and the failure mode considered up front.

**Rule-#9 pre-registration**: `**Hypothesis**:` + `**Success**:` + `**Pivot**:` + `**Measurement**:` + `**Anchor**:` — five fields used together to declare what observable a non-trivial change expects to move *before* the code is written. **Hypothesis** captures the predicted effect, **Success** and **Pivot** are the keep / abandon thresholds, **Measurement** is the exact runnable command (no English instructions), and **Anchor** is the literature citation justifying the threshold. Pre-registering the metric prevents post-hoc fishing for flattering observables (Munafò et al. 2017); the **Pivot** threshold pre-registers the give-up criterion (Ries 2011). Originating implementation: [Minsky](https://github.com/fyodoriv/minsky) (`vision.md` § 9). See [Rule-#9 pre-registration block](spec.md#rule-9-pre-registration-block) in the spec.

**Orchestrator coordination**: `**Touches**: <files>` (the write-set — files the task is expected to modify, distinct from **Files** which may include read-only references), `**Surfaced-by**: <provenance>` (which audit / lint / observer session / sweep produced this task), `**Milestone**: <id>` (free-form milestone identifier — `M1.1`, `Q3-2026`, `v0.2.0`, etc.). Used by orchestrators to parallel-launch agents without merge conflicts (overlapping **Touches** sets should serialise), to query sibling findings, and to filter by roadmap milestone.

**Metadata**: Optional nested fields — **ID**, **Tags**, **Details**, **Files**, **Acceptance**, **Plan**, **Blocked by**, **Blocked**, **Parent**, **Research**, **Last-enriched**, **Estimate**, **Verification**, **Risk**, **Hypothesis**, **Success**, **Pivot**, **Measurement**, **Anchor**, **Touches**, **Surfaced-by**, **Milestone**. Teams can add custom fields beyond these supported fields.

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
12. **Plan and validate** — For non-trivial tasks (everything except single-file <30-minute obvious fixes), writes a plan to `docs/plans/<task-id>.md` from `docs/templates/plan-template.md`, then launches a reviewer subagent (`reviewer` profile, fallback `qa-engineer` → `researcher`) to validate it. The subagent reads the plan + the files in `**Files**:` + project docs and appends a `## Reviewer verdict` block. Only when the verdict is `approved` does work proceed; `needs-revision` triggers up to 3 revision cycles; `reject` halts and reports to the operator. Trivial fixes skip planning
13. **Claim** — File backend: appends `(@agent-id)` to the task line so other agents skip it. Generated backend (git-native / issues): runs `tasks claim <id>` (collision-free)
14. **Work** — Reads the task's metadata, checks AGENTS.md for project conventions, makes changes, runs tests
15. **Scout** — While working, actively looks for bugs, missing tests, stale docs, and other gaps in code it touches — records them as new tasks in TASKS.md so the queue grows smarter with every completed task
16. **Complete** — File backend: removes the entire task block from TASKS.md; generated backend: runs `tasks complete <id>`. Then commits and pushes
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

## Tooling

### CLI

The [`@tasks-md/cli`](packages/cli/) provides task queue management — pick tasks, lint files, sync from issue trackers, and install agent commands.

| Command | What it does |
|---------|-------------|
| `tasks init` | Scaffold TASKS.md + AGENTS.md in the current repo |
| `tasks install` | Install `/next-task` for detected agents (Claude Code, Cursor, Devin, etc.) |
| `tasks pick` | Pick the highest-priority unblocked, unclaimed, non-standing-loop task (`--json` for scripts) |
| `tasks list` | List every task matching filters — CLI counterpart of MCP `list_tasks` (`--json` for scripts) |
| `tasks watch` | Watch TASKS.md files and auto-lint on save (`--fix` auto-corrects on save) |
| `tasks stats` | Show queue overview and throughput from git history (`--json` for scripts) |
| `tasks diff` | Show queue changes since a git ref (`--json` for scripts) |
| `tasks sync <provider>` | Sync issues from `github`, `jira`, or `linear` |
| `tasks generate-commands` | Regenerate agent command variants from canonical sources |

Quick examples:

```bash
npx @tasks-md/cli pick                          # pick highest-priority unblocked non-standing task
npx @tasks-md/cli list --unclaimed --unblocked  # list every pickable task
npx @tasks-md/cli stats                         # queue overview and throughput
npx @tasks-md/lint TASKS.md                     # validate against spec (separate package)
npx @tasks-md/cli sync github --merge           # sync GitHub Issues into TASKS.md
```

Run `npx @tasks-md/cli <command> --help` for full options on any command.

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

Yes — that's what the claiming mechanism is for. In the **file backend** each agent appends `(@agent-id)` to the task it picks up and commits/pushes immediately; other agents see the claim and skip it. This is best-effort, so two agents reading simultaneously can still race. For a **fleet** that must never double-claim — a team of machines each running parallel agents — switch to the [git-native backend](spec.md#fleet-coordination) (`tasks fleet init`), where claims are collision-free via git's atomic ref compare-and-swap.

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

We track work in our own [TASKS.md](TASKS.md). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md):

- Improve the [specification](spec.md)
- Add [examples](examples/) for your stack
- Add or improve [agent commands](commands/) for your tool
- Report bugs or suggest features via [GitHub Issues](https://github.com/tasksmd/tasks.md/issues)

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Disclaimer

This is an independent personal open-source project by Fyodor Ivanischev. It is not affiliated with, endorsed by, sponsored by, or otherwise connected to any current or former employer of the author. Any opinions, designs, or decisions expressed here are the author's own. The codebase contains no proprietary material from any employer.

## License

[MIT](LICENSE)
