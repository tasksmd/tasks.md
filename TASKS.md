# Tasks

## P1

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Details**: Lead with the two core ideas: (1) you think faster than agents code — TASKS.md is your async buffer, (2) planning first leads to better results — writing it down before the agent starts is the key habit. Cover the fragmentation problem, the AGENTS.md parallel, and how TASKS.md solves it.

## P2

- [ ] Publish tasks-mcp to npm
  - **ID**: publish-mcp
  - **Details**: The MCP server exists in `mcp/` with 21 parser tests and CI. Add prepublish build step, verify bin entry works, publish to npm as `tasks-mcp`.
  - **Files**: `mcp/`

- [ ] Publish tasks-lint to npm
  - **ID**: publish-lint
  - **Details**: The linter exists in `lint/` with 22 tests and CI. Package as `tasks-lint` CLI. Needs npm auth.
  - **Files**: `lint/`

- [ ] Add MCP server tool tests
  - **Details**: Only the parser (21 tests) and linter (22 tests) are tested. The 4 MCP tools in `index.ts` (list_tasks, claim_task, complete_task, add_task) have no tests. Add integration tests that exercise the tools against fixture TASKS.md files.
  - **Files**: `mcp/src/index.ts`

- [ ] Set up custom domain tasks.md for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md domain for a cleaner URL.
