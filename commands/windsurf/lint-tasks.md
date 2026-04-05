---
description: Validate TASKS.md files against the tasks.md spec. Use when the user says "lint tasks", "check tasks", "validate tasks", or before committing changes to TASKS.md.
---

# Lint Tasks

Validate all `TASKS.md` files in the current repo against the [tasks.md spec](https://github.com/tasksmd/tasks.md/blob/main/spec.md).

## Context snapshot

```bash
git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
```

## Find all TASKS.md files

```bash
fd TASKS.md "$git_root" --type f --exclude node_modules --exclude .git
```

## Lint each file

```bash
npx @tasks-md/lint <file>
```

## Fix mode

```bash
npx @tasks-md/lint --fix <file>
```

## What the linter checks

- `# Tasks` heading exists as the first line
- Priority sections are `## P0`–`## P3` in ascending order
- Tasks use checkbox format: `- [ ] Task description`
- Task IDs are kebab-case and unique
- `**Blocked by**` references point to existing task IDs
- Metadata uses bold labels indented under the task
- No `[x]` completed tasks (remove them entirely)

## After linting

If errors are found, show them and offer to fix. If all files pass, report success.
