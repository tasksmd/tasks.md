# tasks-lint

Validates [TASKS.md](https://github.com/tasksmd/tasks.md) files against the spec.

## Install

```bash
npm install -g tasks-lint
```

Or run directly with npx:

```bash
npx tasks-lint TASKS.md
```

## Usage

```bash
tasks-lint [--fix] <file|directory> [file|directory...]
```

Pass individual files or directories. Directories are scanned for `.md` files (non-recursive).

```bash
tasks-lint TASKS.md                    # single file
tasks-lint TASKS.md packages/          # file + directory
tasks-lint frontend/TASKS.md backend/  # monorepo
tasks-lint --fix TASKS.md              # auto-fix deterministic errors
```

### Auto-fix mode

Use `--fix` to automatically correct deterministic errors in-place:

- Removes completed (`[x]`) tasks and their metadata blocks
- Cleans up consecutive blank lines left after removals

Ambiguous cases (priority reordering, dangling blockers) are reported but not auto-fixed.

When multiple files are passed, IDs are checked for uniqueness across all files and blocker references are resolved globally.

## Validation Rules

| Rule | Description |
|------|-------------|
| **Header** | First line must be `# Tasks` |
| **Priority order** | `## P0` through `## P3`, in ascending order |
| **Valid priorities** | Only P0–P3 allowed (P4+ is an error) |
| **Checkbox format** | Tasks must use `- [ ]` checkbox syntax |
| **No completed tasks** | `- [x]` tasks should be removed, not left checked |
| **Task placement** | Tasks must appear after a priority heading |
| **ID format** | `**ID**:` values must be kebab-case (`auth-fix`, not `Auth Fix`) |
| **Unique IDs** | No duplicate IDs within a file or across files |
| **Valid blockers** | `**Blocked by**:` must reference IDs that exist somewhere |
| **No orphaned metadata** | `**ID**:`, `**Tags**:`, etc. must be nested under a task |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All files valid |
| `1` | Validation errors found |
| `2` | Usage error (no args, file not found, no .md files) |

## CI Integration

Add to GitHub Actions:

```yaml
- name: Lint TASKS.md
  run: npx tasks-lint TASKS.md
```

Or validate all task files in a monorepo:

```yaml
- name: Lint all task files
  run: npx tasks-lint TASKS.md packages/
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

## License

[MIT](../LICENSE)
