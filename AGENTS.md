# AGENTS.md

## Setup
- No build step. This is a specification repo — just Markdown files.

## Contributing
- Edit `spec.md` for specification changes
- Add examples to `examples/` directory
- Keep README.md as the landing page / quick start
- Use conventional commits: `feat:`, `fix:`, `docs:`

## Code Style
- Markdown only — no custom syntax
- Examples must be valid TASKS.md files that follow the spec
- Files start with `# Tasks` followed by `**Spec**: v0.5`
- Priority sections use headings: `## P0`, `## P1`, `## P2`, `## P3`
- Tasks with blockers need an `**ID**: kebab-case` metadata field
- Use fenced code blocks with `markdown` language tag for examples

## Testing
- All examples in `examples/` must be valid per `spec.md`
- README examples must match spec format

## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
