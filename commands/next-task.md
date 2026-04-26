# Next Task

Pick the highest-priority unblocked task from TASKS.md and work on it autonomously. Loop until the queue is empty or the user stops you.

## Pre-flight stop check

Before anything else — including the context snapshot — check whether the autonomous session should exit immediately. If the repo ships a `scripts/check-zero-ship-streak.mjs` (the convention written in [tasks.md issue tracking](https://github.com/tasksmd/tasks.md)), run it first:

```bash
if [ -f scripts/check-zero-ship-streak.mjs ]; then
  result=$(node scripts/check-zero-ship-streak.mjs 2>&1)
  echo "$result"
  if echo "$result" | head -1 | grep -q '^STOP'; then
    echo ""
    echo "Stop-condition reached. Exiting session — the next session re-runs this check."
    exit 0
  fi
fi
```

The script's first line is `STOP` or `CONTINUE`. `STOP` fires when the audit cascade is exhausted (last 3 commits on `origin/master` are docs-only with no `closes <task-id>` token) or when 100% of TASKS.md tasks carry a `**Human action required**` sub-bullet. Either signal means another autonomous session won't unblock anything — exit cleanly.

If your session prompt mentions a prior `productive_zero_ship` or `diminishing_returns` warning from the orchestrator, treat that as an additional hard stop independent of the script's output.

If the script doesn't exist (the repo hasn't adopted the check yet), or it prints `CONTINUE`, proceed to the context snapshot below.

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

**Uncommitted changes on a feature branch** → check if they belong to a claimed task. If yes, skip to [Finish the work](#finish-the-work). If unrelated, preserve them and continue:
1. Inspect the dirty files with `git diff -- <path>`.
2. If your task can avoid those files, leave them untouched and keep working.
3. If you must touch a dirty file, edit on top of the current contents so both sets of changes survive.
4. Stage only your paths or hunks. Never stage unrelated edits.
5. Never `git stash`, `git reset --hard`, `git checkout --`, or ask the user what to do just because the tree is dirty.

**On main, uncommitted changes** → preserve them too. If they belong to unfinished work, create or switch to that task branch and continue there. If they are unrelated or from another agent, leave main untouched and create a fresh branch or worktree from the current HEAD for your task. Do not stash or discard the existing changes.

**On a feature branch, no uncommitted changes** → check if there's a claimed task for this branch in TASKS.md. If yes, skip to [Finish the work](#finish-the-work). If not, switch to main.

**On main, clean** → continue to [Tidy open PRs](#tidy-open-prs).

**Shared-file rule** → `TASKS.md`, `README.md`, and agent config files often contain unrelated edits from another agent. Do not treat that as a stop signal. Apply your change on top of the live file, then stage only your exact hunk so both changes survive.

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

4. **If ALL repos are empty/blocked**, run the [audit cascade](#audit-cascade).

### Audit cascade {#audit-cascade}

Run these tiers **in order** on the current repo. Stop as soon as any tier produces actionable findings — write them as tasks to TASKS.md and implement the highest-priority one immediately.

**The audit is re-runnable.** Every time you reach this point (queue empty, all repos checked), run the full cascade from Tier 1. Code changes between sessions may introduce new findings. Never treat a previous audit as "permanently done."

**Tier 1 — Verify**
- `git pull --rebase` and prune stale worktrees (`git worktree list`)
- Run the full verify suite: typecheck, lint, test, build
- Any failure → write a task, fix it

**Tier 2 — Security & dead code**
- Hardcoded secrets, missing input validation, unsafe patterns
- Dead exports, unused variables, unreachable code paths
- Actionable `TODO`, `FIXME`, `HACK` comments

**Tier 3 — Doc drift & stale references**
- README examples vs actual behavior
- AGENTS.md with outdated build/test commands
- Stale comments referencing changed or deleted code
- Broken links in docs

**Tier 4 — Dependency modernization** *(applies to every repo type)*
- Node.js: outdated packages, deprecated APIs, missing lockfile entries
- Rust: `cargo outdated`, deprecated crate features
- Python: pinned versions with known CVEs, deprecated stdlib usage
- Shell/Markdown repos: outdated tool references, broken install instructions, stale CI action versions
- Any repo: LICENSE accuracy, .gitignore completeness, CI config drift

**Tier 5 — DX polish** *(applies to every repo type)*
- Help text accuracy: do `--help` outputs match actual behavior?
- Error message quality: are failures actionable or cryptic?
- Naming consistency: file names, function names, CLI flags vs project conventions
- Onboarding friction: can a new contributor clone → run in < 5 minutes?
- Example accuracy: do code examples in docs actually work when copy-pasted?

**After each tier:** if you found issues, write tasks to TASKS.md (with ID, Tags, Details, Files, Acceptance) and start working on the highest-priority one. Do not continue to the next tier — fixing a real issue is more valuable than completing the audit.

### Terminal state {#terminal-state}

If ALL five tiers produce zero findings across ALL repos:

1. Print a final summary exactly once:
   ```
   All [N] repos scanned. Audit clean across 5 tiers. Nothing to do — stopping.
   Repos checked: [list]
   ```
2. **Stop the loop.** Do not print "nothing to do" again on subsequent invocations in the same session.
3. If the user invokes `/next-task` again (new session), re-run the full loop from the top — starting with the context snapshot. The audit is fresh each session.

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

3. Stage only the TASKS.md hunk for your plan (never blindly `git add TASKS.md` if the file already has other edits), then `git commit -m "chore: add plan for <task-id>"`
4. Work through sub-steps, checking them off as you go

**Simple tasks** (single file, obvious fix, < 30 min): skip planning, implement directly.

## Claim and do the work

> **MCP shortcut:** `claim_task` in `tasks-mcp` does this automatically.

Add your identity to the task line:

```markdown
- [ ] The task description ({{AGENT_EXAMPLE}})
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

**HARD RULE:** Before shipping any PR, check: did you discover anything while working? If yes, add it to TASKS.md in the same commit. If you're not sure, you didn't look hard enough — re-read the files you touched and find at least one improvement. An empty scout log means you weren't paying attention.

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
git add <changed-files>
# If TASKS.md has unrelated edits, stage only your task hunk before committing.
git commit -m "<type>: <description>"
git push
gh pr create --title "<type>: <description>" --body "<what changed and why>"
```

If rebase conflicts on TASKS.md: re-read the file, re-apply only your task change on top of the current contents, stage only that hunk, then `git rebase --continue`.

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
- **Audit findings become tasks** — when all repos are empty, run the 5-tier cascade, write findings as tasks, and implement the highest-priority one. Only stop when all tiers are clean (terminal state).
