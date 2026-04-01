# Tasks

## P1

- [ ] Redesign empty-queue behavior in next-task — stay in current repo, clean up, then audit
  - **ID**: next-task-stay-in-repo
  - **Tags**: command, next-task, behavior
  - **Details**: Current `next-task` behavior when the queue is empty:
    1. Searches `~/apps` for TASKS.md files in other repos
    2. Asks user which repo to switch to (but agents often switch silently anyway)
    3. Suggests running `project-audit` skill
    This leads to agents drifting across repos without permission and doing
    unbounded work in the wrong codebase. The new behavior should be:
    **When TASKS.md is empty or has no actionable tasks:**
    1. **Clean up the current repo** — merge open PRs, delete merged branches,
       prune worktrees, sync main with origin
    2. **Run a project audit on the current repo** to find new work (code smells,
       missing tests, outdated deps, doc gaps, etc.)
    3. **Present findings to the user** as candidate tasks — do NOT auto-add them
    4. **Stop and wait** — never search other repos or switch context
    Remove the `find ~/apps` cross-repo search entirely. Remove the "ask the
    user which repo" fallback. The agent stays in its repo or stops.
  - **Files**: `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`,
    `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`,
    `commands/windsurf/next-task.md`, `commands/devin/next-task.md`
  - **Acceptance**: When queue is empty, agent cleans up current repo, runs audit,
    presents findings, and stops. Never searches ~/apps or switches repos.
    All 6 command variants updated. README step list updated if affected.

## P3

- [ ] Set up publish workflow for GitHub Actions
  - **ID**: publish-action
  - **Tags**: tooling
  - **Details**: The `@tasks-md/lint` GitHub Action at `.github/actions/lint/` is ready.
    Verify the action works in a test repo.
  - **Acceptance**: `uses: tasksmd/tasks.md/.github/actions/lint@main` works in external repos

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
