# Tasks

## P1 — Important

- [ ] File an issue on agentsmd/agents.md proposing TASKS.md as a companion standard
  - **Details**: Reference Issue #71 (.agent directory proposal). Position TASKS.md as the task management layer that complements AGENTS.md instructions.

- [ ] Build a tasks-mcp server that reads/writes TASKS.md
  - **Details**: Lightweight MCP server so any agent with MCP support gets TASKS.md integration for free — without waiting for tool vendors to add native support. Commands: list tasks, claim task, complete task, add task.

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Details**: Lead with session persistence (mass market), not multi-agent (niche). Cover the fragmentation problem, the AGENTS.md parallel, and how TASKS.md solves it. Include the FAQ comparisons (vs GitHub Issues, vs TODO.md).

- [ ] Add a simple static website (GitHub Pages)
  - **Details**: Single-page site explaining the spec with examples. Follow the agents.md pattern.
  - **Files**: `docs/` directory or `index.html`

## P2 — Nice to Have

- [ ] Add more examples (Python project, Rust project, mobile app)
- [ ] Add a validator script that checks TASKS.md format
- [ ] Create a TASKS.md generator from GitHub Issues
