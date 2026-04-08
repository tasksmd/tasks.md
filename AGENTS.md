# AGENTS.md

## Setup
- No build step. This is a specification repo — just Markdown files.

## Contributing
- Edit `spec.md` for specification changes
- Add examples to `examples/` directory
- Add or improve agent commands in `commands/` (Claude Code skills, Cursor commands, Windsurf workflows)
- Keep README.md as the landing page / quick start
- Use conventional commits: `feat:`, `fix:`, `docs:`

## Code Style
- Markdown only — no custom syntax
- Examples must be valid TASKS.md files that follow the spec
- Files start with `# Tasks`
- Priority sections use headings: `## P0`, `## P1`, `## P2`, `## P3`
- Tasks with blockers need an `**ID**: kebab-case` metadata field
- Use fenced code blocks with `markdown` language tag for examples

## Testing
- All examples in `examples/` must be valid per `spec.md`
- README examples must match spec format

## Change Propagation Rule

**Any change to the `next-task` command must be applied everywhere it lives, in the same commit:**

- `commands/next-task.md` — shared canonical source
- `commands/claude/skills/next-task/SKILL.md`
- `commands/codex/skills/next-task/SKILL.md`
- `commands/cursor/next-task.md`
- `commands/devin/skills/next-task/SKILL.md`
- `commands/windsurf/next-task.md`
- `README.md` — "What it does" step list
- `examples/complex-tasks.md` — if it illustrates a new format feature

The same rule applies to `lint-tasks` and any other content that exists in multiple places:
- A spec change in `spec.md` → update README examples and all affected `examples/` files
- A new metadata field → add it to spec, README, examples, and all command files that reference the format
- A new step in the loop → update the step count/list in README and every command variant

Never update one file without checking whether the change must propagate to others.
After editing, run: `grep -r "<changed-term>" commands/ examples/ README.md spec.md` to catch missed spots.

## Task Management

- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
