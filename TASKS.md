# Tasks

## P0

## P1

- [ ] next-task: agent loops "nothing to do" instead of finding work
  **ID**: next-task-find-more-work
  **Tags**: next-task, ux, agent-behavior
  **Details**: Real failure observed: after shipping all tasks and running one audit pass, the agent responded "Queue empty, audit done. Nothing to do." for 20+ consecutive `/next-task` invocations. It never roamed to other repos, never re-ran the audit deeper, and never stopped. Three problems to fix:

    (1) **Roaming not deployed everywhere.** The canonical `commands/next-task.md` has repo-roaming logic (scan `~/apps/*/TASKS.md` and switch), but older deployed versions (e.g. the Devin skill variant) had a version without roaming that just said "ask the user." The roaming behavior must be consistent across all variants. Verify all 5 agent-specific copies match the canonical source.

    (2) **Audit cascade runs once then gives up.** The agent treated the audit as a one-time pass — ran Tiers 1-3, found nothing, and declared "audit done" forever. The cascade should be re-runnable: if N sessions have passed since the last audit, re-run it (code changes between sessions may introduce new findings). Also, the cascade stops at Tier 3 for shell repos — Tiers 4-5 (dependency modernization, DX polish) are skipped as "N/A" when they could still find work (e.g. help text accuracy, error message quality).

    (3) **No terminal state guidance.** When all repos are truly empty AND the audit found nothing, the agent should say so clearly ONCE with a summary ("All N repos empty, audit clean across 5 tiers, nothing to do — stopping") and stop. Not repeat "nothing to do" on every subsequent invocation. Add a "Terminal state" section that tells the agent to print a final report and exit the loop.
  **Files**: commands/next-task.md, commands/claude/skills/next-task/SKILL.md, commands/codex/skills/next-task/SKILL.md, commands/cursor/next-task.md, commands/devin/skills/next-task/SKILL.md, commands/windsurf/next-task.md
  **Acceptance**:
    - All 5 agent variants match the canonical source for roaming behavior
    - Audit cascade re-runs if invoked again after N sessions (not treated as permanently done)
    - Tiers 4-5 produce actionable checks for any repo type (not just Node.js/Rust)
    - Terminal state prints a summary and stops the loop cleanly (no repeated "nothing to do")

## P2

## P3

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
