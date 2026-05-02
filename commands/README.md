# Agent Commands

Ready-made commands for popular AI coding agents. Copy the files into your project and commit them so your whole team gets the commands.

## `/next-task`

The full TASKS.md workflow: find → pick (or target an exact task ID) → claim → work → remove → loop.

| Directory | Agent | Format | Install to |
|-----------|-------|--------|------------|
| [`claude/`](claude/skills/next-task/SKILL.md) | Claude Code | [Skill](https://code.claude.com/docs/en/skills) (SKILL.md + YAML frontmatter) | `.claude/skills/next-task/` |
| [`codex/`](codex/skills/next-task/SKILL.md) | OpenAI Codex | [Skill](https://developers.openai.com/codex/skills) (SKILL.md + YAML frontmatter) | `.agents/skills/next-task/` |
| [`cursor/`](cursor/next-task.md) | Cursor | [Command](https://cursor.com/changelog/1-6) (plain Markdown) | `.cursor/commands/` |
| [`devin/`](devin/skills/next-task/SKILL.md) | Devin | [Skill](https://windsurf.com/devin) (SKILL.md + YAML frontmatter) | `.devin/skills/next-task/` |
| [`gemini/`](gemini/next-task.toml) | Gemini CLI | [Command](https://geminicli.com/docs/cli/custom-commands/) (TOML with `prompt`) | `.gemini/commands/` |
| [`windsurf/`](windsurf/next-task.md) | Windsurf | [Workflow](https://docs.codeium.com/windsurf/workflows) (Markdown + YAML frontmatter) | `.windsurf/workflows/` |

## `/lint-tasks`

Validate all TASKS.md files in a repo against the spec. Discovers monorepo packages too.

| Directory | Agent | Format | Install to |
|-----------|-------|--------|------------|
| [`claude/`](claude/skills/lint-tasks/SKILL.md) | Claude Code | Skill | `.claude/skills/lint-tasks/` |
| [`codex/`](codex/skills/lint-tasks/SKILL.md) | OpenAI Codex | Skill | `.agents/skills/lint-tasks/` |
| [`cursor/`](cursor/lint-tasks.md) | Cursor | Command | `.cursor/commands/` |
| [`devin/`](devin/skills/lint-tasks/SKILL.md) | Devin | Skill | `.devin/skills/lint-tasks/` |
| [`gemini/`](gemini/lint-tasks.toml) | Gemini CLI | Command | `.gemini/commands/` |
| [`windsurf/`](windsurf/lint-tasks.md) | Windsurf | Workflow | `.windsurf/workflows/` |

All commands in each set contain the same logic — only the wrapper format differs.
