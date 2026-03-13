# Tasks
Spec v0.5

## P1

- [ ] File an issue on agentsmd/agents.md proposing TASKS.md as a companion standard
  - **Details**: Reference Issue #71 (.agent directory proposal). Position TASKS.md as the task management layer that complements AGENTS.md instructions.

- [ ] Build a tasks-mcp server that reads/writes TASKS.md
  - **Details**: Lightweight MCP server so any agent with MCP support gets TASKS.md integration for free. Commands: list tasks, claim task, complete task, add task.

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Details**: Lead with session persistence, not multi-agent. Cover the fragmentation problem, the AGENTS.md parallel, and how TASKS.md solves it.

- [ ] Add a simple static website (GitHub Pages)
  - **Details**: Single-page site explaining the convention with examples. Follow the agents.md pattern.
  - **Files**: `docs/`

## P2

- [ ] Add more examples (Python project, Rust project, mobile app)
- [ ] Add a validator script that checks TASKS.md format
- [ ] Create a TASKS.md generator from GitHub Issues
