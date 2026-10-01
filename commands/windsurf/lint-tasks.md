---
description: Validate TASKS.md files against the tasks.md spec. Use when the user says "lint tasks", "check tasks", "validate tasks", or before committing changes to TASKS.md. Discovers all TASKS.md files in the repo (including monorepo packages) and runs the linter on each.
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

If `fd` is not available:

```bash
find "$git_root" -name TASKS.md -not -path '*/node_modules/*' -not -path '*/.git/*'
```

## Lint each file

Run the linter on every discovered file:

```bash
npx @tasks-md/lint <file>
```

Or if installed locally:

```bash
npx tasks-lint <file>
```

## Fix mode

Auto-fix: removes completed `[x]` task blocks and cleans up extra blank lines:

```bash
npx @tasks-md/lint --fix <file>
```

## What the linter checks

- `# Tasks` heading exists as the first line
- Priority sections are `## P0`, `## P1`, `## P2`, `## P3` in ascending order
- Tasks use checkbox format: `- [ ] Task description`
- Task IDs are kebab-case and unique across the file
- `**Blocked by**` references point to existing task IDs (no dangling references)
- Metadata uses bold labels indented under the task, including `**ID**:`, `**Tags**:`, `**Details**:`, `**Files**:`, `**Acceptance**:`, `**Plan**:`, `**Blocked by**:`, `**Blocked**:`, `**Parent**:`, `**Research**:`, `**Last-enriched**:`
- No `[x]` completed tasks (completed tasks should be removed entirely)

## After linting

If errors are found:
1. Show the errors to the user
2. Offer to fix them (auto-fix for formatting, manual guidance for structural issues)
3. Re-run the linter to confirm all issues are resolved

If all files pass:
1. Report success with file count

## Plan-file convention (operator review, not enforced)

<!-- Plan-file convention: documentation only, not enforced in v1.
     Promoted to a hard CI gate via the follow-up task lint-tasks-md-plan-required-gate. -->

When you review a TASKS.md file, prefer claimed (`(@agent-id)`) tasks that have
a matching `docs/plans/<task-id>.md` file alongside the implementation. The
file's absence is a smell, not an error — trivial tasks (single file, <30
minutes, obvious fix) legitimately skip the plan step per the `/next-task`
"Plan and validate" rules. `@tasks-md/lint` does NOT fail when a plan file is
missing; the operator catches this in PR review. A hard CI gate is deferred to
a follow-up task; see `lint-tasks-md-plan-required-gate`.
