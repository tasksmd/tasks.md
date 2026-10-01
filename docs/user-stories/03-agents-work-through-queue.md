# User Story: Agents Work Through the Queue Autonomously

> I want agents to pick up tasks, do the work, and loop — without me prompting each step.

## What It Does

`/next-task` is a single command that starts an autonomous work loop:

1. **Snapshot** — reads git status, current branch, and TASKS.md in one shot to orient without redundant tool calls
2. **Tidy** — merges ready PRs, closes stale ones, deletes merged branches, pulls main
3. **Find** — discovers all TASKS.md files from the git root down
4. **Resume** — checks for a previously claimed task and picks up where it left off
5. **Pick** — selects the highest-priority unblocked, unclaimed task
6. **Plan** — for complex tasks, writes a `**Plan**:` checklist into the task block before touching code
7. **Claim** — file backend: appends `(@agent-id)` so other agents skip it; generated backend: `tasks claim <id>` (collision-free)
8. **Work** — reads metadata, checks AGENTS.md, makes changes, runs tests
9. **Complete** — removes the task block, commits, pushes
10. **Ship when approved** — if session-standing `/ship-it` mode is active, follows that delivery path through PR updates, CI watch/fix, merge, branch reconciliation, mirror/release steps, cleanup, and post-delivery sync instead of stopping at an opened PR
11. **Loop** — picks the next task, continues until the queue is empty

## Install ✓

```bash
tasks install                     # auto-detect mode (default)
tasks install --all               # install for every supported agent, even if its dir doesn't exist
tasks install --agent claude      # install for one specific agent
tasks install --hooks             # also install the pre-commit hook that runs tasks-lint
```

### Auto-detect algorithm

`tasks install` walks the [`AGENT_MAPPINGS`](../../packages/cli/src/commands/install.ts) table and, for each agent, checks whether the `Detection signal` directory exists in the current repo. When it does, the matching command file is written to `Installed path`; when it does not, the agent is skipped silently (no error). Pass `--all` to override the detection check and install for every supported agent.

| Agent | Detection signal | Installed path | Source file |
|-------|-----------------|----------------|-------------|
| Claude Code | `.claude/` exists | `.claude/skills/next-task/` (directory) | `commands/claude/skills/next-task/` |
| Codex | `.agents/` exists | `.agents/skills/next-task/` (directory) | `commands/codex/skills/next-task/` |
| Cursor | `.cursor/` exists | `.cursor/commands/next-task.md` | `commands/cursor/next-task.md` |
| Devin | `.devin/` exists | `.devin/skills/next-task/` (directory) | `commands/devin/skills/next-task/` |
| Gemini CLI | `.gemini/` exists | `.gemini/commands/next-task.toml` | `commands/gemini/next-task.toml` |
| Windsurf | `.windsurf/` exists | `.windsurf/workflows/next-task.md` | `commands/windsurf/next-task.md` |

If the detection signal is missing and you didn't pass `--all`, the agent is skipped silently — `tasks install` exits 0 even when zero agents matched. Use `--all` to scaffold every agent's command directory regardless of what's already present, or `--agent <name>` to target one specific entry from the table.

All paths are **project-local** (inside your repo). Commit the file so your whole team gets the command. The same canonical source — [`commands/next-task.md`](../../commands/next-task.md) — is regenerated into every agent variant by `tasks generate-commands`, so the command behaves identically across agents.

> **Implemented**: `tasks install` auto-detects agent directories and copies the right files. See [`packages/cli/src/commands/install.ts`](../../packages/cli/src/commands/install.ts). The detection table is pinned by `packages/cli/src/commands/install.test.ts`.

## Usage

Start the loop:

```
/next-task
```

The agent picks the highest-priority unblocked task, claims it, does the work, removes it from the file, and loops. You keep adding tasks while the agent keeps draining them.

### Success looks like

A successful `/next-task` run is behaviorally precise — anyone reading the source-of-truth code paths can verify it:

1. The agent calls [`pickBestTask()`](../../packages/parser/src/index.ts), which selects the highest-priority task whose `**Blocked**` field is empty, whose `**Blocked by**` IDs are not present in any discovered `TASKS.md`, that has no `(@agent)` claim, and that is not a `standing-loop` task.
2. In the file backend, the agent claims it by appending `(@<agent-id>)` to the task line and pushes (or commits, in single-agent setups); in a generated backend it runs `tasks claim <id>` for a collision-free claim.
3. The agent does the work — reads metadata, makes changes, runs tests, etc.
4. On completion, the agent removes the entire task block (task line + metadata + sub-tasks) and commits.
5. If `/ship-it` mode is active for the session, the agent keeps going through the approved delivery steps instead of stopping at commit, push, or PR-open.
6. Loop repeats until `pickBestTask()` returns `undefined` (queue exhausted) or every remaining task is blocked or claimed by another agent.

`tasks pick` is the read-only inspection of step 1 — same algorithm, no claim, no commit. `/next-task` is `tasks pick` plus claim → plan → implement → commit → loop.

The deterministic-pick contract is pinned by unit tests in `packages/cli/src/cli.test.ts` (`pickBestTask` describe block) and `packages/mcp/src/tools.test.ts`; both must agree on every filter so CLI and MCP cannot drift.

## What the Agent Does at Each Step

### Checking workspace

Before picking a task, the agent captures a context snapshot (git status + branch + TASKS.md) and follows the first matching branch:

- **Uncommitted changes on a feature branch** — relates to a claimed task? Finish it. Unrelated? Stash.
- **On a feature branch, no uncommitted changes** — claimed task in TASKS.md? Resume it. Otherwise switch to main.
- **Clean + on main** — tidy open PRs, pull latest, proceed to find + pick.

### Picking a task

Walks P0 → P1 → P2 → P3. Within each priority:
1. **Unblocking impact** — prefer tasks whose ID appears in another task's `Blocked by`
2. **Unblocked** — skip tasks with unresolved blockers
3. **Unclaimed** — skip tasks with `(@agent-name)`
4. **Tag match** — skip tasks outside the agent's specialties
5. **Hardest first** — among equals, prefer architectural or multi-file tasks over simple ones

### Completing a task

Removes the entire block (task line + metadata + sub-tasks), commits with a conventional commit message, and pushes. TASKS.md conflicts from other agents are trivial to resolve. When `/ship-it` mode is active, delivery continues through that mode's CI, PR merge, cleanup, and release/mirror steps before the next queue iteration.

## Command Formats

All six commands contain the same logic — only the wrapper format differs:

| Agent | Format | Key difference |
|-------|--------|---------------|
| Claude Code | SKILL.md + YAML frontmatter | `allowed-tools` header |
| Codex | SKILL.md + YAML frontmatter | Same as Claude |
| Cursor | Plain Markdown | No frontmatter |
| Devin | SKILL.md + YAML frontmatter | `allowed-tools` + `permissions` scoping |
| Gemini CLI | TOML with `prompt` field | Prompt wrapped in TOML |
| Windsurf | Markdown + YAML frontmatter | `description` in frontmatter |

> **Implemented**: Commands are generated from canonical sources (`commands/next-task.md` and `commands/lint-tasks.md`). The `tasks generate-commands` command produces all 6 agent-specific files for each command, and CI verifies they never drift.

## Files Involved

| File | Purpose |
|------|---------|
| `commands/claude/skills/next-task/SKILL.md` | Claude Code skill |
| `commands/codex/skills/next-task/SKILL.md` | Codex skill |
| `commands/cursor/next-task.md` | Cursor command |
| `commands/devin/skills/next-task/SKILL.md` | Devin skill |
| `commands/gemini/next-task.toml` | Gemini CLI command |
| `commands/windsurf/next-task.md` | Windsurf workflow |
| [commands/README.md](../../commands/README.md) | Format details |

## Try it yourself

Sixty-second walkthrough — watch `tasks pick` walk a two-priority queue across two iterations.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q
cat > TASKS.md <<'EOF'
# Tasks

## P0

- [ ] Investigate auth bug

## P1

- [ ] Add new feature
EOF
npx -y @tasks-md/cli pick                    # picks the P0 — "Investigate auth bug"

# Agent does the work, then removes the completed task block in one commit.
# Simulating that step by hand here:
cat > TASKS.md <<'EOF'
# Tasks

## P1

- [ ] Add new feature
EOF
npx -y @tasks-md/cli pick                    # now picks the P1 — "Add new feature"
cd .. && rm -rf tmp-tasks-demo
```

That second `pick` is the loop. As long as `pickBestTask()` returns something, the agent keeps going; when it returns `undefined` the queue is empty and the session ends.
