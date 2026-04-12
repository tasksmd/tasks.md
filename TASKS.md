# Tasks

## P0

## P1

- [ ] Users can target a specific task ID with `/next-task` so standing loops are reusable across repos
  - **ID**: next-task-target-task-id
  - **Tags**: commands, workflow, queue
  - **Details**: Repos are starting to share standing task IDs like
    `standing-audit-gap-loop`, but `/next-task` currently only auto-picks from the
    queue. Add a documented optional task-ID argument so `/next-task standing-audit-gap-loop`
    means "work that exact task if it exists and is actionable; otherwise explain why not."
    This should work the same way across every command variant so teams can reuse the same
    queue-driving prompt in different repos and agents.
  - **Files**: `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md`, `README.md`
  - **Acceptance**: Every `next-task` variant documents and supports the same optional task-ID
    targeting behavior, including the blocked/claimed/missing-task cases.

- [ ] Projects can express recurring audit-only queue-filling loops without copying a giant bespoke task into every repo
  - **ID**: standing-loop-pattern
  - **Tags**: spec, workflow, queue
  - **Details**: Bosun and AgentBrew both want a recurring "audit the repo, compare competitors,
    and only write tasks" loop. Today the only way to express that is a long repo-local task block.
    Define one official reusable pattern — whether that ends up being a standard task template, a
    compact metadata convention, or a dedicated shared command — so teams can keep repo-specific
    audit inputs small while reusing the same operator loop everywhere.
  - **Files**: `spec.md`, `README.md`, `examples/complex-tasks.md`, `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md`
  - **Acceptance**: TASKS.md has one documented, cross-agent pattern for recurring audit-only
    loops, including where repo-specific context belongs and how agents should execute it.

## P2

- [ ] README shows when to use plain `/next-task`, targeted `/next-task <task-id>`, and any standing-loop pattern
  - **ID**: next-task-readme-routing
  - **Tags**: docs, workflow, onboarding
  - **Details**: Once `next-task` can target known tasks and TASKS.md has a reusable standing-loop
    pattern, the README needs a clear routing story. A new user should understand when to let the
    queue choose automatically, when to point at a specific task ID, and when a recurring audit
    loop is the right tool.
  - **Files**: `README.md`
  - **Acceptance**: The README teaches the three queue-entry modes with examples that are consistent
    with the command and spec.

## P3

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
