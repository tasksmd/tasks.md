# Tasks

## P0

## P1

## P2

- [ ] Gemini next-task variant is a truncated TOML — missing Plan, Claim, Scout, Ship, Loop, and Constraints sections
  **ID**: gemini-next-task-incomplete
  **Tags**: next-task, gemini, parity
  **Details**: The `commands/gemini/next-task.toml` prompt field only covers through "Pick a task" (line 84). It's missing the Plan, Claim and do the work, Scout while you work, Finish the work, Ship it, Loop, and Constraints sections that all other variants have. This means Gemini agents using this command won't know how to plan complex tasks, scout for new work, or follow shipping conventions.
  **Files**: commands/gemini/next-task.toml
  **Acceptance**:
    - All sections from the canonical source are present in the Gemini TOML variant
    - The TOML prompt field renders correctly (no escaping issues with triple-quoted strings)

## P3

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
