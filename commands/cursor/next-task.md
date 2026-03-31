# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it.

## 0. Sync & tidy

Get to a clean, up-to-date baseline before picking any work.

**Land open PRs:**

```bash
gh pr list --state open --json number,title,mergeable,statusCheckRollup
```

For each open PR:
- Checks pass, no conflicts → merge it: `gh pr merge <number> --squash --delete-branch`
- Checks failing or conflicts → note it and skip
- Stale (no activity in >7 days, no linked task in TASKS.md) → close it: `gh pr close <number>`, delete the branch

**Delete stale remote branches:**

```bash
git fetch --prune
gh pr list --head <branch> --state merged,closed  # check per branch
git push origin --delete <branch>                 # delete if merged/closed
```

Skip branches with an open PR or commits in the last 48h.

**Sync main:**

```bash
git checkout main 2>/dev/null || git checkout master
git pull --rebase
```

**Clean merged local branches:**

```bash
git branch --merged main | grep -v '^\*\|main\|master'
# delete each: git branch -d <branch>
```

## 1. Check workspace

Assess the current state after syncing:

```bash
git status --short
git branch --show-current
git log --oneline -5
```

- **Uncommitted changes?** — Check if they relate to a claimed task. If yes, finish that work first (skip to step 5). If the changes are unrelated or abandoned, stash them: `git stash push -m "next-task: stash unrelated changes"`.
- **Not on main/master?** — You're on a feature branch. Check if it has an open task associated with it (look in TASKS.md for your `(@agent-id)` claim). If yes, finish it first (skip to step 5). If no task is claimed, the branch may be leftover — switch to main.
- **Clean + on main?** — Proceed to step 2.

## 2. Find the queue

Start with the **current repo** — look for TASKS.md at the git root:

```bash
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cat "$git_root/TASKS.md" 2>/dev/null
```

Read this file and proceed to step 3. Only this repo's tasks should be considered for picking.

**If the current repo has no TASKS.md or all tasks are blocked/claimed**, tell the user and suggest checking other repos:

```bash
find ~/apps -maxdepth 3 -name "TASKS.md" -not -path "*/.git/*" -not -path "*/node_modules/*" | sort
```

Ask the user which repo they'd like to pick from before proceeding — never silently switch repos.

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
5. **Hardest first** — among equally qualified tasks, prefer the harder one (more files, more ambiguity, architectural decisions). Hard tasks are where agents add the most value; simple tasks are for humans.

If all tasks at every priority level are blocked, claimed, or unmatched — tell the user. Suggest unblocking actions if possible (e.g., "Task X blocks 3 others — should I work on its blocker instead?").

**If TASKS.md is empty or has no actionable tasks** — do not stop. Actively find work:

1. Run the `project-audit` skill — a code-level audit across four lenses (no-brainer fixes, stability gaps, dependency modernization, docs drift). It will write prioritized tasks to TASKS.md.
2. If architectural direction or strategic fit questions need answering first, run `strategic-review` before or alongside the audit.
3. Once the audit completes and tasks are written to TASKS.md, return to step 4 and pick the top result.

## 5. Plan (if the task is complex)

A task is complex if it involves multiple files, architectural decisions, unclear scope, or estimated effort > 1 hour. **When in doubt, treat it as complex.**

**For complex tasks — write a plan before touching code:**

1. Explore the relevant code: read files, trace call paths, understand data flow
2. Add a `**Plan**:` sub-task checklist to the task's block in TASKS.md:

```markdown
- [ ] Task description (@your-agent-id)
  - **Details**: original details
  - **Plan**:
    - [ ] Sub-step 1
    - [ ] Sub-step 2
    - [ ] Sub-step 3
```

3. Commit: `git add TASKS.md && git commit -m "chore: add plan for <task-id>"`
4. Execute the plan step by step, checking off sub-tasks as you go

**For simple tasks** (single file, obvious fix, < 30 min): skip planning and implement directly.

## 6. Claim and do the work

> **MCP shortcut:** If `tasks-mcp` is available, use its `claim_task` tool instead of manually editing the file.

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

## 7. Complete the task

> **MCP shortcut:** If `tasks-mcp` is available, use its `complete_task` tool instead of manually editing the file — it handles block removal and empty section cleanup automatically.

Remove the entire task block from TASKS.md — the task line, all metadata, and any sub-tasks. Completed task history lives in git log.

Commit everything together:

```bash
git add <changed-files> TASKS.md
git commit -m "<conventional commit for the actual work>"
git pull --rebase
git push
```

If `git pull --rebase` conflicts on TASKS.md, re-read the file, re-apply your task removal, then `git add TASKS.md && git rebase --continue`. TASKS.md conflicts are usually trivial — another agent claimed or removed a different task.

## 8. Loop

Switch back to main and pull latest:

```bash
git checkout main 2>/dev/null || git checkout master
git pull --rebase
```

Read TASKS.md again and pick the next task (go to step 2). Continue until the queue is empty or the user stops you.
