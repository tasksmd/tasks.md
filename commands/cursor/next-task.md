# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 1. Check workspace

Before anything else, assess the current state:

```bash
git status --short
git branch --show-current
git log --oneline -5
```

- **Uncommitted changes?** — Check if they relate to a claimed task. If yes, finish that work first (skip to step 5). If the changes are unrelated or abandoned, stash them: `git stash push -m "next-task: stash unrelated changes"`.
- **Not on main/master?** — You're on a feature branch. Check if it has an open task associated with it (look in TASKS.md for your `(@agent-id)` claim). If yes, finish it first (skip to step 5). If no task is claimed, the branch may be leftover — switch to main after stashing any dirty state.
- **Clean + on main?** — Pull latest and proceed to step 2.

```bash
git checkout main 2>/dev/null || git checkout master
git pull --rebase
```

## 2. Find the queue

```bash
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
find "$git_root" -name "TASKS.md" -not -path "*/.git/*" -not -path "*/node_modules/*" | sort | head -20
```

Read all discovered TASKS.md files.

## 3. Finish unfinished work

Scan TASKS.md for any task you previously claimed — look for your `(@agent-id)` on any task line.

**If you find a claimed task:**
1. Read its details and check what state it's in
2. Check `git log` and `git stash list` for related work
3. If the work is done but not committed/removed — go to step 6 to complete it
4. If the work is partially done — resume it at step 5
5. If the claim is stale and no related work exists — unclaim it (remove your `(@agent-id)`) and continue to step 4

**If no claimed task exists**, proceed to step 4.

## 4. Pick a task

Walk the priority sections in order: **P0 → P1 → P2 → P3**. For each priority level, evaluate the tasks and select one.

### Priority decision guidelines

- **P0 (critical)** — Always pick these first. They're blocking the project.
- **P1 (high)** — Pick these next. Important work that should be done soon.
- **P2 (medium)** — Standard work. Pick from here when P0 and P1 are empty or all blocked.
- **P3 (low)** — Nice-to-haves. Only pick these when nothing higher is available.

### Within a priority level, select by:

1. **Unblocking impact** — prefer tasks whose **ID** appears in another task's **Blocked by** field (completing it unblocks other work)
2. **Unblocked status** — skip tasks where **Blocked by** references an ID that still exists in any TASKS.md
3. **Unclaimed** — skip tasks with `(@agent-name)` — they're claimed by another agent
4. **Tag match** — if the task has **Tags**, check whether they match your capabilities (e.g., skip `frontend` tags if you're working in a backend-only repo)
5. **First available** — among equally qualified tasks, pick the first one in the list

If all tasks at every priority level are blocked, claimed, or unmatched — tell the user. Suggest unblocking actions if possible (e.g., "Task X blocks 3 others — should I work on its blocker instead?").

## 5. Claim and do the work

Append your identity to the task line. Use the format `@<tool>-<instance>` (e.g., `@cursor, @cursor-2`):

```markdown
- [ ] The task description (@your-agent-id)
```

Create a feature branch for the work:

```bash
git checkout -b <branch-name>
```

Then do the work:
- Read the task's **Details**, **Files**, and **Acceptance** metadata
- Check AGENTS.md for the project's build, test, and lint commands
- Make minimal, focused edits
- Run verification commands (test/lint/typecheck) after changes
- Fix any issues before proceeding

## 6. Complete the task

Remove the entire task block from TASKS.md — the task line, all metadata, and any sub-tasks. Completed task history lives in git log.

Commit everything together:

```bash
git add <changed-files> TASKS.md
git commit -m "<conventional commit for the actual work>"
git pull --rebase
git push
```

If `git pull --rebase` conflicts on TASKS.md, re-read the file, re-apply your task removal, then `git add TASKS.md && git rebase --continue`. TASKS.md conflicts are usually trivial — another agent claimed or removed a different task.

## 7. Loop

Switch back to main and pull latest:

```bash
git checkout main 2>/dev/null || git checkout master
git pull --rebase
```

Read TASKS.md again and pick the next task (go to step 2). Continue until the queue is empty or the user stops you.
