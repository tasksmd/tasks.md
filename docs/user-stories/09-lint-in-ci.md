# User Story: Lint in CI

> As a team lead, I want CI to catch TASKS.md formatting issues before they hit main — so agents always see a valid queue.

## What It Catches

`tasks-lint` validates TASKS.md files against the spec:

| Rule | What it checks |
|------|---------------|
| Header | First line must be `# Tasks` |
| Priority order | `## P0` through `## P3`, in ascending order |
| Valid priorities | Only P0–P3 (P4+ is an error) |
| Checkbox format | Tasks must use `- [ ]` syntax |
| No completed tasks | `- [x]` on top-level tasks = remove it, don't check it off |
| Task placement | Tasks must appear after a priority heading |
| ID format | `**ID**:` values must be kebab-case |
| Unique IDs | No duplicate IDs within a file or across files |
| Valid blockers | `**Blocked by**:` must reference IDs that exist somewhere |
| No orphaned metadata | Metadata fields must be nested under a task |

## Setup

### Run locally

```bash
node lint/index.js TASKS.md                    # single file
node lint/index.js TASKS.md packages/          # file + directory
node lint/index.js frontend/TASKS.md backend/  # monorepo
```

### Add to GitHub Actions

```yaml
- name: Lint TASKS.md
  run: npx tasks-lint TASKS.md
```

Monorepo variant:

```yaml
- name: Lint all task files
  run: npx tasks-lint TASKS.md packages/
```

### Add to a pre-commit hook

```bash
#!/bin/bash
node lint/index.js TASKS.md || exit 1
```

## Example Output

```
ERROR: TASKS.md:1: first line must be '# Tasks', got '# Todo'
ERROR: TASKS.md:8: priority heading P1 out of order (after P2)
ERROR: TASKS.md:15: completed task should be removed, not checked off
ERROR: TASKS.md:22: ID 'Auth Fix' must be kebab-case (lowercase letters, numbers, hyphens)
ERROR: TASKS.md:30: blocked-by references unknown ID 'missing-task'

Checked 1 file(s), found 5 error(s)
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All files valid |
| `1` | Validation errors found |
| `2` | Usage error (no args, file not found, no .md files) |

## Auto-Fix ✓

`--fix` mode auto-fixes deterministic cases:

```bash
node lint/index.js --fix TASKS.md
```

- **Remove completed tasks** — `[x]` top-level tasks and their metadata blocks
- **Remove empty priority sections** — headings with no tasks under them
- **Normalize ID casing** — convert to kebab-case
- **Remove orphaned metadata** — metadata fields not nested under a task

Ambiguous cases (priority reordering, dangling blockers) are still reported as errors.

## Cross-File Validation

When multiple files are passed, the linter checks globally:
- **IDs unique across all files** — catches duplicate IDs in different packages
- **Blockers resolved globally** — a `Blocked by` in one file can reference an ID in another

This is critical for monorepos where cross-package dependencies are common.

## Files Involved

| File | Purpose |
|------|---------|
| `lint/index.js` | Linter implementation |
| `lint/test.js` | 22 test cases |
| [lint/README.md](../../lint/README.md) | Full documentation |
