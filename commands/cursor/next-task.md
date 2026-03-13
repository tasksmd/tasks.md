# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## Steps

1. **Find the queue** — find all `TASKS.md` files from the current directory up to the git root. Read them all.

2. **Pick a task** — select the first unclaimed, unblocked task by priority (P0 > P1 > P2 > P3):
   - Skip tasks with `(@agent-name)` — claimed by another agent
   - Skip tasks where **Blocked by** references an ID still in any TASKS.md
   - Prefer tasks whose **ID** appears in other tasks' **Blocked by** (unblocking has highest impact)
   - If the task has **Tags**, check whether they match your capabilities

3. **Claim it** — append `(@cursor)` to the task line and commit:
   ```
   git add TASKS.md && git commit -m "chore: claim task — <description>"
   ```

4. **Do the work** — read **Details**, **Files**, **Acceptance** metadata. Make focused edits. Run tests.

5. **Complete** — remove the entire task block (task line + metadata + sub-tasks) from TASKS.md. Commit with a conventional commit message:
   ```
   git add <changed-files> TASKS.md
   git commit -m "<type>: <description>"
   git pull --rebase && git push
   ```

6. **Loop** — read TASKS.md again, pick the next task. Continue until empty or stopped.
