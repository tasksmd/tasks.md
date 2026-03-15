# User Story: Run the Autonomous Loop

> As an agent, I read TASKS.md, pick a task, do the work, remove it, and loop — no human prompting needed.

## The Workflow

```
You                              Agent
──────────────────               ──────────────────
Write tasks as ideas come  →     /next-task
Add more tasks             →     Claims P0 task, starts working
Add more tasks             →     Completes task, picks next one
Review agent's commits     ←     Commits, removes task, loops
Add more tasks             →     ...keeps draining the queue
```

You're always adding to the queue. The agent is always draining it. This is the core loop.

## What the Agent Does

### Step 1: Check workspace state

```bash
git status --short
git branch --show-current
```

- **Uncommitted changes from a prior claim?** → resume that task
- **On a feature branch?** → check for existing claim, resume or switch to main
- **Clean + on main?** → pull latest, proceed

### Step 2: Find the queue

Discover all `TASKS.md` files from the git root down (excluding `.git/`, `node_modules/`). Read all of them — tasks are prioritized globally, not per-file.

### Step 3: Resume or pick

Check for a prior claim with your `(@agent-id)`. If found, resume it. Otherwise, walk P0 → P1 → P2 → P3 and select by:

1. **Unblocking impact** — completing it frees other tasks
2. **Unblocked** — all blockers are resolved
3. **Unclaimed** — no `(@agent-name)` on the line
4. **First available** — among equals, pick the first

### Step 4: Claim

Append `(@your-agent-id)` to the task line:

```markdown
- [ ] Add rate limiting to public API endpoints (@claude-code)
```

In multi-agent setups, commit and push the claim immediately.

### Step 5: Work

- Read the task's **Details**, **Files**, **Acceptance** metadata
- Check AGENTS.md for build/test/lint commands
- Make minimal, focused edits
- Run verification after changes

### Step 6: Complete

Remove the entire task block from TASKS.md — task line, metadata, sub-tasks. Commit everything together:

```bash
git add <changed-files> TASKS.md
git commit -m "feat: add rate limiting to public API"
git push
```

### Step 7: Loop

Switch to main, pull latest, read TASKS.md again, pick the next task. Continue until the queue is empty or the user stops you.

## When All Tasks Are Blocked

If every remaining task is blocked, claimed, or outside the agent's capabilities:

1. Tell the user what's blocking progress
2. Suggest unblocking actions ("Task X blocks 3 others — should I work on its blocker?")
3. Stop and wait for instructions

## When the Queue Is Empty

Tell the user there are no tasks and ask for instructions. Don't create tasks unprompted.

## Conflict Resolution

TASKS.md conflicts from other agents are trivial — each agent works on a different task (different line). If `git pull --rebase` conflicts on TASKS.md:

1. Re-read the file
2. Re-apply your task removal
3. `git add TASKS.md && git rebase --continue`
