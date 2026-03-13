---
description: Pick and work on the next task from TASKS.md
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS
---

# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 1. Read the queue

Find and read TASKS.md:

```bash
# Find nearest TASKS.md (walk up to git root)
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
find "$git_root" -name "TASKS.md" -not -path "*/.git/*" | head -20
```

Read all discovered TASKS.md files.

## 2. Pick a task

Select the first unclaimed, unblocked task by priority:
1. **P0** first, then **P1**, **P2**, **P3**
2. Skip tasks with `(@agent-name)` — they're claimed by another agent
3. Skip tasks where **Blocked by** references an ID that still exists in any TASKS.md file
4. Prefer tasks that unblock other tasks (check if this task's ID appears in other tasks' **Blocked by**)

If no tasks are available, tell the user.

## 3. Claim it

Append your identity to the task line:

```
- [ ] The task description (@claude-code)
```

Commit the claim:
```bash
git add TASKS.md
git commit -m "chore: claim task — <short task description>"
```

## 4. Do the work

- Read the task's **Details**, **Files**, and **Acceptance** metadata
- Make minimal, focused edits
- Run the project's test/lint/typecheck commands if they exist
- Fix any issues before proceeding

## 5. Complete the task

Remove the entire task block from TASKS.md — the task line, all metadata, and any sub-tasks. Completed task history lives in git log.

If other tasks had **Blocked by** referencing this task's ID, those tasks are now unblocked.

Commit everything together:
```bash
git add -A  # or specific files if in a multi-agent setup
git commit -m "<conventional commit for the actual work>"
git pull --rebase
git push
```

## 6. Loop

Read TASKS.md again and pick the next task. Continue until the queue is empty or the user stops you.
