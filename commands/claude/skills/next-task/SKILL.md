---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - MultiEdit
  - Grep
  - Glob
  - LS
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

TASKS.md is already loaded from the context snapshot. If it was empty or missing:

```bash
find ~/apps -maxdepth 3 -name "TASKS.md" ! -path "*/.git/*" ! -path "*/node_modules/*" | sort
```

Ask the user which repo to pick from — never switch repos silently.

**If TASKS.md has no actionable tasks** — do not stop. Generate new work by running through the audit cascade below. Work through each tier in order, committing and shipping fixes as you go. Each tier generates tasks; pick and complete them before moving to the next tier.

### Audit Cascade (when queue is empty)

Run these in order. Each pass generates tasks → pick the best ones → implement → ship → loop.

**Tier 1 — Code health (highest impact)**
1. **Typecheck + lint + test** — run the full verify suite. Fix any failures immediately.
2. **Biome/ESLint auto-fix** — run `biome check --write` or equivalent. Commit formatting fixes.
3. **Security audit** — `npm audit`, `cargo audit`, `pip-audit`. Patch-level fixes are P2; major-version bumps are P3.
4. **Dead code** — search for unused exports, unreachable branches, commented-out blocks. Delete them.
5. **Swallowed errors** — `grep -r "catch {}" src/` and `catch { return` patterns. Add logging or proper handling.
6. **Missing timeouts** — find `execFileSync`, `spawnSync`, `fetch` calls without timeout options. Add them.
7. **Consistency bugs** — find patterns used in 5/6 places but missing in the 6th (e.g., auto-sync called after 5 mutations but not the 6th).

**Tier 2 — Large files and code smells**
8. **Large files** — find source files >400 lines. Split into focused modules if responsibilities are mixed.
9. **God modules** — find files everything imports from. Check if they can be split.
10. **High-churn files** — `git log --since="3 months ago" --name-only | sort | uniq -c | sort -rn | head -15`. If a file changes constantly, it may need refactoring.
11. **Duplicate logic** — find copy-pasted patterns across files. Extract shared utilities.
12. **Magic numbers/strings** — find hardcoded values that should be named constants.
13. **Test coverage gaps** — find source files with no corresponding `.test.ts`. Write tests for the most critical ones.

**Tier 3 — Documentation audit**
14. **README vs reality** — verify every command in README actually works. Fix stale examples.
15. **AGENTS.md vs codebase** — check repo layout, data flow, ownership boundary tables are current.
16. **VISION.md vs code** — verify capability status table, agent counts, catalog counts match reality.
17. **User stories vs CLI** — run every command in `docs/user-stories/` and verify output matches.
18. **Stale doc counts** — grep for hardcoded numbers (agent counts, skill counts, etc.) across all docs. Update any that drifted.
19. **CONTRIBUTING.md** — verify categories, fields, and verify commands match current code.
20. **Code comments** — find comments that describe code that no longer exists or works differently.

**Tier 4 — Dependency modernization**
21. **Outdated dependencies** — `npm outdated` / `cargo update --dry-run`. Update patch+minor versions.
22. **Deprecated APIs** — search for deprecated Node.js/library APIs. Migrate to replacements.
23. **Custom code with upstream replacements** — check if any hand-written utilities now have well-maintained packages. Replace if simpler.
24. **Dev dependency cleanup** — find devDependencies that are no longer used. Remove them.

**Tier 5 — DX and polish**
25. **Error message quality** — trace every user-facing error path. Ensure each says what went wrong AND what to do next.
26. **CLI output consistency** — check that all commands use the same icon/color/formatting patterns.
27. **Help text** — verify `--help` for every command is accurate and has examples.
28. **Shell completion** — verify tab completion works for common commands.
29. **Performance** — measure `time agentbrew sync` and `time agentbrew check`. If >2s, profile and optimize.
30. **CI pipeline** — verify CI runs everything local verify does. Add missing gates.

**How to use the cascade:**
- Start at Tier 1. If it produces tasks, work them. If the tier is fully clean, move to Tier 2.
- Each fix is a separate branch + PR. Don't batch unrelated fixes.
- After completing a tier, re-run it to confirm it's clean before moving on.
- If a tier is already clean (nothing to fix), say so in one line and move to the next.
- Stop when all 5 tiers are clean OR the user interrupts.

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
- [ ] The task description (@@claude-code, @claude-code-2)
```

Create a branch and do the work:

```bash
git checkout -b <branch-name>
```

- Follow **Details**, **Files**, and **Acceptance** in the task metadata
- Check AGENTS.md for build, test, and lint commands
- Make minimal, focused edits — fix the root cause, not the symptom
- Run verification (test/lint/typecheck) before moving on

## Finish the work {#finish-the-work}

Verify the implementation is complete:

- All acceptance criteria from the task are met
- Tests pass, lint is clean
- No unrelated changes are staged

## Ship it {#ship-it}

> **MCP shortcut:** `complete_task` in `tasks-mcp` removes the task block automatically.

Remove the entire task block from TASKS.md (task line + all metadata). Completed history lives in git log. Include this removal in the same commit as your code — the task is done when the PR lands:

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
- **Do not switch repos silently** — if this repo has no actionable tasks, tell the user and ask before switching.
- **Do not mark tasks `[x]`** — remove the entire block. Checked-off tasks clutter the queue.
- **Do not stop after one task** — loop until the queue is empty or the user interrupts.
- **Do not claim tasks already claimed by another agent** — skip `(@agent-name)` unless it's your own stale claim.
