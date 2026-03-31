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
7. **Claim** — appends `(@agent-id)` so other agents skip it
8. **Work** — reads metadata, checks AGENTS.md, makes changes, runs tests
9. **Complete** — removes the task block, commits, pushes
10. **Loop** — picks the next task, continues until the queue is empty

## Install ✓

```bash
tasks install
# Auto-detects which agent directories exist and copies the right files
```

Or copy manually:

| Agent | Command |
|-------|---------|
| Claude Code | `cp -r commands/claude/skills/next-task .claude/skills/` |
| Codex | `cp -r commands/codex/skills/next-task .agents/skills/` |
| Cursor | `cp commands/cursor/next-task.md .cursor/commands/` |
| Devin | `cp -r commands/devin/skills/next-task .devin/skills/` |
| Gemini CLI | `cp commands/gemini/next-task.toml .gemini/commands/` |
| Windsurf | `cp commands/windsurf/next-task.md .windsurf/workflows/` |

All paths are **project-local** (inside your repo). Commit the file so your whole team gets the command.

> **Implemented**: `tasks install` auto-detects agent directories and copies the right files. See `packages/cli/`.

## Usage

Start the loop:

```
/next-task
```

The agent picks the highest-priority unblocked task, claims it, does the work, removes it from the file, and loops. You keep adding tasks while the agent keeps draining them.

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

Removes the entire block (task line + metadata + sub-tasks), commits with a conventional commit message, and pushes. TASKS.md conflicts from other agents are trivial to resolve.

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

> **Implemented**: Commands are generated from a canonical source (`commands/next-task.md`). The `tasks generate-commands` command produces all 6 agent-specific files, and CI verifies they never drift.

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
