# Tasks

## P1

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Details**: Lead with the two core ideas: (1) you think faster than agents code — TASKS.md is your async buffer, (2) planning first leads to better results — writing it down before the agent starts is the key habit. Cover the fragmentation problem, the AGENTS.md parallel, and how TASKS.md solves it. Include a personal story about how TASKS.md proved invaluable while building a large AI orchestrator project (multi-agent pipelines, personas, background execution) — the kind of complex project where ideas and tasks pile up faster than any single agent can handle.

## P2

- [ ] Publish tasks-mcp to npm
  - **ID**: publish-mcp
  - **Tags**: tooling, mcp
  - **Details**: The MCP server exists in `mcp/` with 21 parser tests and CI. Add prepublish build step, verify bin entry works, publish to npm as `tasks-mcp`.
  - **Files**: `mcp/`

- [ ] Publish tasks-lint to npm
  - **ID**: publish-lint
  - **Tags**: tooling, lint
  - **Details**: The linter exists in `lint/` with 22 tests and CI. Package as `tasks-lint` CLI. Needs npm auth.
  - **Files**: `lint/`

- [ ] Set up custom domain tasks.md for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md domain for a cleaner URL.

