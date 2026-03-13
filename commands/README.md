# Agent Commands

Ready-made `/next-task` commands for popular AI coding agents. Each implements the full TASKS.md workflow: find → pick → claim → work → remove → loop.

| Directory | Agent | Format | Install to |
|-----------|-------|--------|------------|
| [`claude/`](claude/skills/next-task/SKILL.md) | Claude Code | [Skill](https://code.claude.com/docs/en/skills) (SKILL.md + YAML frontmatter) | `.claude/skills/next-task/` |
| [`codex/`](codex/skills/next-task/SKILL.md) | OpenAI Codex | [Skill](https://developers.openai.com/codex/skills) (SKILL.md + YAML frontmatter) | `.agents/skills/next-task/` |
| [`cursor/`](cursor/next-task.md) | Cursor | [Command](https://cursor.com/changelog/1-6) (plain Markdown) | `.cursor/commands/` |
| [`gemini/`](gemini/next-task.toml) | Gemini CLI | [Command](https://geminicli.com/docs/cli/custom-commands/) (TOML with `prompt`) | `.gemini/commands/` |
| [`windsurf/`](windsurf/next-task.md) | Windsurf | [Workflow](https://docs.codeium.com/windsurf/workflows) (Markdown + YAML frontmatter) | `.windsurf/workflows/` |

All five commands contain the same logic — only the wrapper format differs. Copy the file(s) into your project and commit them so your whole team gets the command.
