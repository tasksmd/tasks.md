# Tasks

## P1

- [ ] Publish all packages to npm
  - **ID**: publish-all
  - **Tags**: tooling
  - **Details**: All prep done — READMEs, publishConfig, repo URLs fixed, dry-run passes.
    Run `npm adduser` then `scripts/publish-all.sh`. Order: `@tasks-md/parser` →
    `tasks-lint` → `tasks-mcp` → `@tasks-md/cli`.
  - **Acceptance**: All 4 packages installable via npm/npx

## P2

- [ ] Add MCP-aware step to next-task commands: prefer `complete_task` tool over manual file edits
  - **ID**: next-task-mcp-aware
  - **Tags**: mcp, commands
  - **Details**: The next-task commands (claude, cursor, windsurf, codex, gemini) all instruct agents to manually edit TASKS.md for claim/complete operations. If `tasks-mcp` is available, agents should prefer its tools (`claim_task`, `complete_task`, `pick_task`) over manual file edits — they handle block removal, empty section cleanup, and format compliance automatically. Add a note to step 5 (claim) and step 6 (complete) in all command variants: "If tasks-mcp is available, use its `claim_task`/`complete_task` tools instead of manual edits."
  - **Files**: `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`, `commands/windsurf/next-task.md`, `commands/cursor/next-task.md`, `commands/codex/skills/next-task/SKILL.md`

## P3

- [ ] Set up publish workflow for GitHub Actions
  - **ID**: publish-action
  - **Tags**: tooling
  - **Details**: The `tasks-lint` GitHub Action at `.github/actions/lint/` is ready but
    depends on `tasks-lint` being published to npm. Once publish-all is done, verify the
    action works in a test repo.
  - **Blocked by**: publish-all
  - **Acceptance**: `uses: tasksmd/tasks.md/.github/actions/lint@main` works in external repos

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
