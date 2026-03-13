# AGENTS.md

## Setup
- No build step. This is a specification repo — just Markdown files.

## Contributing
- Edit `spec.md` for specification changes
- Add examples to `examples/` directory
- Keep README.md as the landing page / quick start
- Use conventional commits: `feat:`, `fix:`, `docs:`

## Code Style
- Markdown only — no HTML, no custom syntax
- Examples must be valid TASKS.md files that follow the spec
- Priority sections must use exact headings: `## P0 — Critical`, `## P1 — Important`, `## P2 — Nice to Have`, `## P3 — Future`
- Use fenced code blocks with `markdown` language tag for examples

## Testing
- All examples in `examples/` must be valid per `spec.md`
- README examples must match spec format

## Task Management
- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Mark tasks [x] when done — do not delete completed tasks
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
