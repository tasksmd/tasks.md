---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS
---

# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 1. Find the queue

```bash
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
find "$git_root" -name "TASKS.md" -not -path "*/.git/*" -not -path "*/node_modules/*" | sort | head -20
```

Read all discovered TASKS.md files.

## 2. Pick a task

First, check if you already claimed a task in a previous session — look for your `(@agent-id)` on any task line. If found, resume that task (skip to step 4).

Otherwise, select the first unclaimed, unblocked task by priority:

1. **P0** first, then **P1**, **P2**, **P3**
2. Skip tasks with `(@agent-name)` — they're claimed by another agent
3. Skip tasks where **Blocked by** references an ID that still exists in any TASKS.md file
4. Prefer tasks that unblock other tasks — if this task's **ID** appears in another task's **Blocked by**, it has the highest impact
5. If the task has **Tags**, check whether they match your capabilities

If no tasks are available, tell the user.

## 3. Claim it

Append your identity to the task line. Use the format `@<tool>-<instance>` (e.g., `@claude-code`, `@claude-code-2`):

```markdown
- [ ] The task description (@your-agent-id)
```

In multi-agent setups, commit and push the claim immediately. Otherwise, the claim commits with your work in step 5.

## 4. Do the work

- Read the task's **Details**, **Files**, and **Acceptance** metadata
- Check AGENTS.md for the project's build, test, and lint commands
- Make minimal, focused edits
- Run verification commands (test/lint/typecheck) after changes
- Fix any issues before proceeding

## 5. Complete the task

Remove the entire task block from TASKS.md — the task line, all metadata, and any sub-tasks. Completed task history lives in git log.

Commit everything together:

```bash
git add <changed-files> TASKS.md
git commit -m "<conventional commit for the actual work>"
git pull --rebase
git push
```

## 6. Loop

Read TASKS.md again and pick the next task. Continue until the queue is empty or the user stops you.
