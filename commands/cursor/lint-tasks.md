
## Command: Lint Tasks

Validate all `TASKS.md` files in the current repo against the [tasks.md spec](https://github.com/tasksmd/tasks.md/blob/main/spec.md). Discovers files in monorepo packages too.

### Steps

1. Find all TASKS.md files: `fd TASKS.md . --type f --exclude node_modules --exclude .git`
2. Lint each file: `npx @tasks-md/lint <file>`
3. To auto-fix: `npx @tasks-md/lint --fix <file>`
4. Show results and offer to fix any errors found
