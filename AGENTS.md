# AGENTS.md

## Setup

```bash
npm install           # install all workspace dependencies
npm run build         # build all packages (parser → lint → mcp → cli)
npm test              # run all tests across all packages
```

## Project Structure

Monorepo with 4 packages:

```
packages/
├── parser/   # @tasks-md/parser — parses TASKS.md files into structured data
├── lint/     # tasks-lint — validates TASKS.md files against the spec
├── mcp/      # tasks-mcp — MCP server for agent task management
└── cli/      # @tasks-md/cli — unified CLI (pick, lint, stats, diff, sync, install)
```

Other key paths:
- `spec.md` — the TASKS.md specification (v1.0)
- `examples/` — example TASKS.md files (must lint clean)
- `commands/` — ready-made `/next-task` commands for agents
- `docs/` — blog posts and landing page

## Contributing
- Edit `spec.md` for specification changes
- Add examples to `examples/` directory
- Add or improve agent commands in `commands/` (Claude Code skills, Cursor commands, Windsurf workflows)
- Keep README.md as the landing page / quick start
- Use conventional commits: `feat:`, `fix:`, `docs:`

## Code Style
- TypeScript with strict mode in all packages
- Markdown examples must be valid TASKS.md files that follow the spec
- Files start with `# Tasks`
- Priority sections use headings: `## P0`, `## P1`, `## P2`, `## P3`
- Tasks with blockers need an `**ID**: kebab-case` metadata field
- Use fenced code blocks with `markdown` language tag for examples

## Testing

```bash
npm test                              # all packages
npm test --workspace packages/parser  # single package
npm test --workspace packages/lint
npm test --workspace packages/mcp
npm test --workspace packages/cli
```

- All examples in `examples/` must be valid per `spec.md`
- README examples must match spec format
- Run `node packages/lint/dist/cli.js TASKS.md examples/` to lint all files

## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
