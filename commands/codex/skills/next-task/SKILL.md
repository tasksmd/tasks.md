---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
---

# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it autonomously. Loop until the queue is empty or the user stops you.

## Context snapshot

Before doing anything else, capture the current state:

```bash
git status --short && git branch --show-current && git log --oneline -5
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".") && cat "$git_root/TASKS.md" 2>/dev/null || echo "(no TASKS.md)"
```

Use this output to decide where to start — do not re-run these unless state changes.

## Policies

After reading TASKS.md, check for `<!-- policy: ... -->` HTML comments. These are project rules you must follow throughout the session:

- **File-level policies** (between `# Tasks` and first `## P*`) apply to every task
- **Section-level policies** (after a `## P*` heading) apply only to tasks in that section

Read all policies before picking a task. Follow them alongside the task's own metadata. If a policy conflicts with a task's instructions, the policy takes precedence — it's the project owner's rule.

## Decision tree

Read the context snapshot and follow the first matching branch:

**Uncommitted changes on a feature branch** → check if they belong to a claimed task. If yes, skip to [Finish the work](#finish-the-work). If unrelated, stash: `git stash push -m "next-task: stash unrelated changes"` then continue.

**On a feature branch, no uncommitted changes** → check if there's a claimed task for this branch in TASKS.md. If yes, skip to [Finish the work](#finish-the-work). If not, switch to main.

**On main, clean** → continue to [Tidy open PRs](#tidy-open-prs).

## Tidy open PRs

Quickly land or close dangling PRs before picking new work:

```bash
gh pr list --state open --json number,title,mergeable,statusCheckRollup
```

- Checks pass + no conflicts → `gh pr merge <number> --squash --delete-branch`
- Checks failing or conflicts → skip
- Stale (>7 days, no linked task) → `gh pr close <number>` + delete the branch

Then sync:

```bash
git pull --rebase
git branch --merged main | grep -v '^\*\|main\|master'
# delete each merged local branch: git branch -d <branch>
```

If there were no open PRs, skip the sync — you're already up to date from the context snapshot.

## Find the queue

TASKS.md is already loaded from the context snapshot.

**If TASKS.md has no actionable tasks** — meaning the queue is literally empty, or
every remaining task is either claimed by another agent or has an unresolved
`**Blocked by**:` — proceed to [Empty queue: roam to the next repo](#empty-queue). **Large or
complex tasks are still actionable.** A P0 epic with 5 acceptance criteria is not
"no actionable tasks" — it needs decomposition, not avoidance.

**When all remaining tasks are large/complex:** Decompose the highest-priority one:
1. Pick the first unclaimed, unblocked task (P0 → P1 → P2 → P3)
2. Break it into 2-4 sub-tasks in TASKS.md (same priority, add `**Parent**: <original-id>`)
3. Each sub-task should be one-commit-sized (1-3 files)
4. Commit: `chore: decompose <task-id> into sub-tasks`
5. Implement the first sub-task
6. Do NOT run the audit while decomposable tasks exist

### Empty queue: roam to the next repo {#empty-queue}

When the current repo's queue is truly empty (no unclaimed, unblocked tasks):

1. **Scan for work across repos:**

```bash
# Find all TASKS.md files in ~/apps/
for repo in ~/apps/*/; do
  tasks_file="$repo/TASKS.md"
  [ -f "$tasks_file" ] || continue
  # Count unclaimed, unblocked tasks per priority (P0 first)
  p0=$(grep -c '^\- \[ \]' "$tasks_file" 2>/dev/null | head -1)
  blocked=$(grep -c '\*\*Blocked by\*\*:' "$tasks_file" 2>/dev/null | head -1)
  actionable=$((p0 - blocked))
  [ "$actionable" -gt 0 ] && echo "$repo $actionable"
done
```

2. **Pick the repo with the highest-priority work** (most P0 > most P1 > most total).
   Read each candidate's TASKS.md to verify tasks are truly actionable (not just recurring/watch tasks).

3. **Switch without asking:**
   ```
   Switching to ~/apps/<repo> (N actionable tasks)
   ```
   Then `cd` to that repo and restart the next-task loop from the top.

4. **If ALL repos are empty/blocked**, clean up the current repo and run a project audit:
   - Prune stale worktrees: `git worktree list` → remove any that point to deleted branches
   - `git pull --rebase`
   - Run the full verify suite, note any failures
   - Check for: dead code, test coverage gaps, doc drift, outdated deps, code smells
   - **Write real tasks to TASKS.md** for anything actionable you find (low branch coverage, stale docs,
     missing tests, security issues). Use proper format with ID, Tags, Details, Files, Acceptance.
   - **Implement the first task you just created** — don't just report "tier clean" and stop.
     The goal is to always make progress. If the audit found 3 issues, add them as tasks and start
     working on the highest-priority one.
   - Only stop and wait for the user if the audit genuinely found nothing to improve.

## Resume unfinished work

Scan TASKS.md for your `(@agent-id)` claim:

- **Found + work is done but not committed** → skip to [Ship it](#ship-it)
- **Found + work is in progress** → skip to [Finish the work](#finish-the-work)
- **Found + stale (no related code)** → unclaim (remove `(@agent-id)`), pick fresh
- **None found** → continue to [Pick a task](#pick-a-task)

## Pick a task

Walk **P0 → P1 → P2 → P3** in order. Within each level, prefer:

1. Tasks whose **ID** appears in another task's `**Blocked by**` — completing them unblocks others
2. Tasks with no `**Blocked by**`, or whose blockers no longer exist in any TASKS.md
3. Unclaimed — skip tasks with `(@agent-name)` that isn't you
4. **Hardest first** — architectural, multi-file, or ambiguous tasks over simple ones

If everything is blocked or claimed, tell the user and suggest unblocking actions.

> **MCP shortcut:** If `tasks-mcp` is available, use `pick_task` — it applies these rules automatically.

## Plan (complex tasks only)

A task is complex if it spans multiple files, involves architectural decisions, or will take > 1 hour. **When in doubt, treat it as complex.**

1. Explore the code: read files, trace call paths, understand data flow
2. Add a `**Plan**:` checklist to the task block in TASKS.md:

```markdown
- [ ] Task description (@your-agent-id)
  - **Details**: original details
  - **Plan**:
    - [ ] Sub-step 1
    - [x] Sub-step 2
```

3. `git add TASKS.md && git commit -m "chore: add plan for <task-id>"`
4. Work through sub-steps, checking them off as you go

**Simple tasks** (single file, obvious fix, < 30 min): skip planning, implement directly.

## Claim and do the work

> **MCP shortcut:** `claim_task` in `tasks-mcp` does this automatically.

Add your identity to the task line:

```markdown
- [ ] The task description (@@codex, @codex-2)
```

Create a branch and do the work:

```bash
git checkout -b <branch-name>
```

- Follow **Details**, **Files**, and **Acceptance** in the task metadata
- Check AGENTS.md for build, test, and lint commands
- Make minimal, focused edits — fix the root cause, not the symptom
- Run verification (test/lint/typecheck) before moving on

## Scout while you work

While implementing, you have deep context about the code you're touching. **Actively look for gaps and record them as new tasks.** This happens naturally as you read and modify code — don't treat it as a separate pass.

**What to look for:**
- Bugs, edge cases, missing error handling in code you're reading
- Missing tests for critical code paths you discover
- TODOs, FIXMEs, or HACKs in files you touch
- Stale comments or docs referencing changed/deleted code
- Code duplication near your changes
- Security concerns (hardcoded secrets, missing validation, unsafe patterns)
- Inconsistencies with project conventions from AGENTS.md

**How to record:**
- Add new tasks to TASKS.md under the appropriate priority:
  - **P1** — bugs, security issues, broken behavior
  - **P2** — missing tests, code health, stale docs
  - **P3** — refactoring, nice-to-haves, minor DX improvements
- Include **Files** and **Details** so the next agent has context
- Keep descriptions actionable — "Fix X in Y" not "X seems wrong"
- Do NOT stop current work to fix discoveries — just record and move on
- Include TASKS.md additions in your commit when you ship the current task

**Goal:** Every completed task should leave the queue with more queued improvements than when you started. You're not just executing tasks — you're scouting the terrain for future work.

## Finish the work {#finish-the-work}

Verify the implementation is complete:

- All acceptance criteria from the task are met
- Tests pass, lint is clean
- No unrelated changes are staged
- **The completed task block is removed from TASKS.md** (task line + all metadata lines). This is not optional — a task is not done until it's gone from the file. History lives in git log.

## Ship it {#ship-it}

> **MCP shortcut:** `complete_task` in `tasks-mcp` removes the task block automatically.

**Every commit that completes a task MUST also remove that task from TASKS.md.** No exceptions. If you forget, go back and amend the commit before pushing.

```bash
git add <changed-files> TASKS.md
git commit -m "<conventional commit message>"
git push
gh pr create --title "<same as commit message>" --body "<what changed and why>"
```

If rebase conflicts on TASKS.md: re-read the file, re-apply your removal, then `git add TASKS.md && git rebase --continue`.

## Loop

```bash
git checkout main 2>/dev/null || git checkout master && git pull --rebase
```

Go back to [Find the queue](#find-the-queue) and pick the next task. Continue until the queue is empty or the user stops you.

---

## Constraints

- **Do not ask which task to pick** — walk P0→P3 and pick the first unblocked, unclaimed task. Asking wastes the user's time.
- **Do not ask for confirmation before starting** — announce the chosen task in one line and begin.
- **Auto-roam when the queue is empty** — scan `~/apps/*/TASKS.md` for work in other repos. Only stop and audit when ALL repos are empty.
- **Do not mark tasks `[x]`** — remove the entire block. Checked-off tasks clutter the queue. A task with code changes committed but still present in TASKS.md is **not done**.
- **Do not stop after one task** — loop until the queue is empty or the user interrupts.
- **Do not claim tasks already claimed by another agent** — skip `(@agent-name)` unless it's your own stale claim.
- **Do not auto-implement audit findings** — when all repos are empty, present findings to the user and wait. Only implement after approval.
