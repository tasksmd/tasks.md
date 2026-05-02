# Tasks

## P0

## P1

## P2

## P3

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.

- [ ] Refresh tasks.md AGENTS.md to match the shared agent-tool repo baseline
  - **ID**: refresh-tasks-md-agent-guide-baseline
  - **Tags**: agents, docs, agentbrew, tasks-md
  - **Details**: Cross-repo audit on 2026-04-30 found that `AGENTS.md` still
    describes this as a Markdown-only spec repo with no build step, while the
    repo now has package workspaces for parser, lint, MCP, and CLI code plus
    canonical command variants. Bring it up to the same baseline as the other
    agent-tool repos so agents know the real verification and propagation
    workflow.
  - **Files**:
    - `AGENTS.md`
    - `Agentfile.yaml`
    - `package.json`
    - `commands/`
    - `examples/`
    - `TASKS.md`
  - **Acceptance**:
    - `AGENTS.md` includes purpose, repo layout, development commands,
      verification gate, task queue policy, Agentfile/agentbrew sync path, and
      canonical-source boundaries for command variants
    - The stale "no build step" guidance is replaced with the actual package
      scripts and when to run each one
    - The next-task/lint-tasks propagation rule remains explicit and points to
      every generated variant that must change together
    - `npm run lint`, `npm test`, and `npx -y @tasks-md/lint TASKS.md` pass
