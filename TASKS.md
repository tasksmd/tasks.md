# Tasks

## P0

## P1

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

- [ ] tasks-mcp can target a known task ID so automation does not need custom file logic
  - **ID**: tasks-mcp-targeted-task-parity
  - **Tags**: mcp, workflow, queue
  - **Details**: `/next-task` is gaining targeted task-ID routing and a reusable standing-loop
    pattern, but agents that drive TASKS.md through `tasks-mcp` still only get the generic pick
    flow or fuzzy query matching on claim and complete. Add an MCP-side exact-task entry point so
    higher-level automation can run the same queue behavior through tools instead of re-implementing
    file parsing and eligibility checks.
  - **Files**: `packages/mcp/src/tools.ts`, `packages/mcp/src/tools.test.ts`, `packages/parser/src/index.ts`, `packages/mcp/README.md`, `README.md`
  - **Blocked by**: `standing-loop-pattern`
  - **Acceptance**: The MCP server exposes one documented way to fetch and optionally claim a
    specific task by ID with clear missing, claimed, and blocked behavior, and the docs explain how
    that path composes with standing loops once the shared pattern lands.

- [ ] README shows when to use plain `/next-task`, targeted `/next-task <task-id>`, and any standing-loop pattern
  - **ID**: next-task-readme-routing
  - **Tags**: docs, workflow, onboarding
  - **Details**: Once `next-task` can target known tasks and TASKS.md has a reusable standing-loop
    pattern, the README needs a clear routing story. A new user should understand when to let the
    queue choose automatically, when to point at a specific task ID, and when a recurring audit
    loop is the right tool.
  - **Files**: `README.md`
  - **Blocked by**: `standing-loop-pattern`
  - **Acceptance**: The README teaches the three queue-entry modes with examples that are consistent
    with the command and spec.

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
