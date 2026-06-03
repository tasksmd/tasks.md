# Backlog.md

**What it is.** A markdown-native task manager with a CLI, a Kanban web UI, a VS Code extension, and MCP integration. Each task is its own `.md` file (with YAML frontmatter) under a `backlog/` folder; it runs with or without git, and is explicitly built for AI agents (Claude Code, Codex, Gemini, Cursor). It has priority, single-assignee, dependencies (`--dep`), and a nice acceptance-criteria / definition-of-done checklist model.

**How it overlaps with `tasks.md`.** Both are markdown-first, git-friendly, and aimed at AI agents reading and updating tasks from the repo. Both have priorities and dependencies, and both expose an MCP surface.

**How `tasks.md` differs.**
- **One file vs. a folder of files.** `tasks.md` is a single `TASKS.md` with priority sections; Backlog.md is a directory of per-task files plus config.
- **Thin spec vs. a product.** Backlog.md ships a board UI, web server, and config system. `tasks.md` deliberately ships only a format, a parser/linter, and a `/next-task` workflow — coordination is delegated to a backend.
- **Collision-free claiming.** Backlog.md's assignee field is best-effort; nothing stops two agents claiming the same unassigned task. `tasks.md`'s git-native backend makes claims collision-free via git compare-and-swap, with no server.

**Our stance.** Closest peer in spirit, and the clearest illustration of the thinness line: where Backlog.md grows a board + UI + server, `tasks.md` stays a spec and borrows coordination. **Borrow:** its acceptance-criteria / definition-of-done checklist pattern is excellent for agents — `tasks.md` already has an `**Acceptance**` field and should keep leaning into structured completion criteria.
