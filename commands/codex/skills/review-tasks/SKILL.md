---
name: review-tasks
description: Review every open task for truth, usefulness, and priority against the current code and history, then clean the queue. Use when the user says "review tasks", "groom the queue", "audit the backlog", "which tasks are stale", or "are these priorities right". Format checks belong to /lint-tasks.
---

# Review Tasks

Review every open task for **truth, usefulness, and priority** against the current code and history, then clean up the queue. This is a content review. Format checks belong to `/lint-tasks`, which this command runs first.

A queue rots quietly: shipped work never gets removed, premises go stale, and "someday" items sit at P1. Run this command when the queue feels noisy, after a big refactor or migration, or on a regular cadence.

## Arguments

- No argument: review every task in the repo.
- A priority (`P1`) or a tag: review only that slice.
- `--dry-run`: report only. Do not change the queue.

## Ground rules

- **Verify, don't trust.** Task text is a claim. Check each claim against the code, git history, and the tracker before you judge it.
- **Evidence for every verdict.** A verdict without a `file:line`, commit SHA, PR/issue state, or command result is a guess. Do not apply guesses.
- **Review is read-only.** Do not fix code while you review. Record a finding instead.
- **Never invent outside state.** If you cannot check an upstream PR or issue, say "unverified" and leave the task as it is.
- **Do not publish.** This command never comments on, closes, or opens issues or PRs in other people's repos.

## Step 1 — Snapshot

```bash
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$git_root"
npx @tasks-md/lint TASKS.md          # format problems first; fix them before the review
snapshot=$(mktemp)
npx @tasks-md/cli list --json > "$snapshot"    # every open task, any backend
git log --oneline -30
```

Then read what the repo is for: `README.md`, `VISION.md` or `ROADMAP.md` if present, and `AGENTS.md`. Note the repo's goals, the tools and agents it still supports, and anything recently removed or deprecated. A task that serves a removed goal is obsolete even if its code still exists.

If the queue lives in GitHub Issues or a git-native log, `tasks list --json` reads it through the active backend. Apply changes with `tasks update`, `tasks complete`, and `tasks cancel` instead of editing a file.

## Step 2 — Judge each task

For every task, answer these questions in order. Stop at the first verdict that sticks.

| # | Question | How to check | Verdict if no |
|---|----------|--------------|---------------|
| 1 | Is the work still undone? | `git log --oneline -S '<symbol>'`, `git log --grep '<keyword>'`, merged PRs, read the named files | **DONE** |
| 2 | Is the premise still true? | Do the named files, flags, agents, and dependencies still exist? Does the bug still reproduce? Is the upstream item still open? | **OBSOLETE** |
| 3 | Is it useful? | Does it trace to a repo goal or a real user problem? Would anyone notice if it vanished? Is its success metric a vanity count? | **OBSOLETE** (say why) |
| 4 | Is it unique? | Another task, recurring checklist, or doc with the same outcome | **DUPLICATE** (name the other) |
| 5 | Does it belong here? | Is the code it changes in this repo? | **MOVE** (name the target repo) |
| 6 | Is the priority right? | Compare with the priority rubric below | **REPRIORITIZE** (new level + reason) |
| 7 | Can an agent act on it? | Testable Acceptance, existing paths, no stale numbers, no references to deleted task IDs or removed tools | **REWRITE** (exact fixes) |
| 8 | Is the block real? | For a **Blocked** task: is the blocker still in place? | **BLOCKED-STALE** (unblock or delete) |

If every answer is yes: **KEEP**.

### Priority rubric

| Level | Use it when | Red flags that it is too high |
|-------|-------------|-------------------------------|
| P0 | Something is broken or users are blocked now | Nothing is broken today |
| P1 | Core work that should ship soon | Nothing can happen until an outside party acts; the feature it serves is unused; it has waited months with no one asking |
| P2 | Valuable, not urgent | It guards only against future drift; its own tags or text say "someday" |
| P3 | Someday, kept for reference | — |

A task blocked on an outside party with no action available belongs at P3 or in a watch list, not P1. A cluster of tasks around a tool nobody runs moves down together.

### Smells worth a second look

- The task names a file path that `ls` cannot find.
- It cites a deleted task ID, a closed upstream PR, or a removed agent or tool.
- It contains a hard-coded count (of agents, files, drafts, or a coverage percentage) that has drifted.
- Its acceptance depends on CI that the repo does not run.
- Its Details say "planned", "WIP", or "once X lands", and X has landed or died.
- Two tasks at different priorities describe the same outcome.

## Step 3 — Split large queues

Above roughly 40 tasks, split the review by priority section, or into chunks of about 30 tasks. Give each chunk to a separate read-only reviewer, with this command's Step 2 as its rubric. Each reviewer returns the table from Step 4. Merge the tables yourself, and resolve DUPLICATE pairs that span chunks.

## Step 4 — Report

Produce one table, ordered by line:

```markdown
| Line | ID or title | Verdict | Evidence | Action |
|------|-------------|---------|----------|--------|
| 42 | fix-auth-crash | DONE | a1b2c3d "fix(auth): refresh race"; src/auth.ts:88 | Delete |
```

Follow it with:

- **Totals:** tasks reviewed, and the count for each verdict.
- **Cross-cutting findings:** at most five patterns, such as a stale cluster, a removed tool that many tasks still cite, or a missing gate that let done work linger.

With `--dry-run`, stop here.

## Step 5 — Apply

Apply only verdicts that have evidence.

1. **DONE / OBSOLETE / DUPLICATE:** delete the block (file backend) or `tasks complete` / `tasks cancel` it. Fold any unique detail from a duplicate into the task you keep.
2. **MOVE:** file the task in the target repo first, then delete it here.
3. **REPRIORITIZE:** move the block under the new heading. Put it first in that section if it is the most important one there.
4. **REWRITE:** make the exact fixes from the table. Keep the task ID stable.
5. **BLOCKED-STALE:** remove or update the **Blocked** field.
6. Remove deleted IDs from any allowlist or **Blocked by** reference that names them.
7. Run `npx @tasks-md/lint TASKS.md` again, plus the repo's own task checks.
8. Commit with a message that lists the verdict counts, for example `chore(tasks): review queue — 12 done, 4 obsolete, 6 reprioritized`. Put the report table in the PR body.

## Done when

Every task in scope has a verdict with evidence, the applied changes pass lint, and the report is in the PR or shown to the user.
