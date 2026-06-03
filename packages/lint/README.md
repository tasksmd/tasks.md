# @tasks-md/lint

[![npm](https://img.shields.io/npm/v/@tasks-md/lint)](https://www.npmjs.com/package/@tasks-md/lint)

Validates [TASKS.md](https://github.com/tasksmd/tasks.md) files against the spec.

> **Scope: file format, not backend state.** The linter checks that a `TASKS.md` is well-formed (header, priority sections, checkbox tasks, metadata shape). It is backend-agnostic — it validates the file the file backend hand-edits *and* the snapshot a git-native backend generates. Backend coordination (collision-free claims, leases) is verified by [`@tasks-md/conformance`](../conformance/) and `tasks doctor`, not by lint. After a file-backend mutation, `npx -y @tasks-md/lint TASKS.md` exiting 0 is the completeness check.

## Install

```bash
npm install -g @tasks-md/lint
```

Or run directly with npx:

```bash
npx -y @tasks-md/lint TASKS.md
```

## Use

```bash
tasks-lint TASKS.md                      # lint one file
tasks-lint TASKS.md packages/            # root file + nested package TASKS.md files
tasks-lint frontend/TASKS.md backend/    # explicit monorepo paths
tasks-lint --fix TASKS.md                # auto-fix completed tasks and orphaned blanks
tasks-lint --require-prereg TASKS.md     # enforce rule-#9 pre-registration fields
```

Pass individual files or directories. Directory targets include direct `.md` files and recursively discover nested `TASKS.md` files for monorepos. When multiple files are passed, IDs are checked for uniqueness across all files and blocker references are resolved globally.

## API

```text
tasks-lint [--fix] <file|directory> [file|directory...]
```

| Rule | What it catches |
|------|-----------------|
| Header | First line must be `# Tasks` |
| Priority order | `## P0` through `## P3`, in ascending order |
| Valid priorities | Only P0–P3 (P4+ is an error) |
| Checkbox format | Tasks must use `- [ ]` syntax |
| No completed tasks | `- [x]` on top-level tasks should be removed, not checked off |
| Task placement | Tasks must appear after a priority heading |
| ID format | `**ID**:` values must be kebab-case |
| Unique IDs | No duplicate IDs within a file or across files |
| Valid blockers | `**Blocked by**:` IDs must exist somewhere |
| Empty `**Blocked**` | `**Blocked**:` must have a non-empty reason |
| Empty `**Research**` | `**Research**:` must have a non-empty value |
| ISO `**Last-enriched**` | Must be `YYYY-MM-DD` |
| No orphaned metadata | `**ID**:`, `**Tags**:`, etc. must nest under a task |
| Policy in comment | `policy:` directives must live inside `<!-- ... -->` |
| Policy not empty | `<!-- policy: -->` with no directive text is an error |
| Unclosed comments | HTML comments must have a closing `-->` |
| Rule-#9 fields *(opt-in)* | With `--require-prereg`: every task block must have **Hypothesis**, **Success**/**Acceptance**, **Pivot**, **Measurement**, **Anchor** |

`--fix` removes `[x]` completed tasks (and their metadata blocks) and cleans up consecutive blank lines. Ambiguous cases (priority reordering, dangling blockers) are reported but not auto-fixed.

| Exit code | Meaning |
|-----------|---------|
| `0` | All files valid |
| `1` | Validation errors found |
| `2` | Usage error (no args, file not found, no `.md` files) |

Example output:

```
ERROR: TASKS.md:1: first line must be '# Tasks', got '# Todo'
ERROR: TASKS.md:8: priority heading P1 out of order (after P2)
ERROR: TASKS.md:15: completed task should be removed, not checked off
ERROR: TASKS.md:22: ID 'Auth Fix' must be kebab-case (lowercase letters, numbers, hyphens)
ERROR: TASKS.md:30: blocked-by references unknown ID 'missing-task'

Checked 1 file(s), found 5 error(s)
```

CI integration is one line:

```yaml
- name: Lint TASKS.md
  run: npx -y @tasks-md/lint TASKS.md packages/
```

## Opt-in: rule-#9 pre-registration

Pass `--require-prereg` to enforce that every task block carries the five [rule-#9 pre-registration fields](../../spec.md#rule-9-pre-registration-block) — **Hypothesis**, **Success** (or **Acceptance**), **Pivot**, **Measurement**, **Anchor**. The pattern prevents post-hoc fishing for flattering metrics by forcing the team to declare what observable the change is expected to move *before* the code is written.

```bash
tasks-lint --require-prereg TASKS.md
```

Output adds one summary line:

```
rule-#9 pre-registration: scanned 12 block(s); clean=8, grandfathered=2, blocking=2
```

Per-block errors look like:

```
ERROR: TASKS.md: rule-#9 task 'metrics-endpoint' missing Pivot, Anchor; add the field(s) — see https://github.com/tasksmd/tasks.md/blob/main/spec.md#rule-9-pre-registration-block
```

Adopting the rule on an existing repo is usually a two-step ratchet — `--prereg-allowlist=<file>` lets you grandfather legacy task IDs while preventing *new* tasks from regressing. The file is one ID per line; blank lines and `#` comments are ignored:

```bash
# .prereg-allowlist
# Tasks filed before rule-#9 adoption; backfill or remove from the list.
auth-fix
metrics-endpoint
refactor-legacy
```

```bash
tasks-lint --require-prereg --prereg-allowlist=.prereg-allowlist TASKS.md
```

Grandfathered blocks still surface in the count so the operator can see remaining backfill debt without breaking the build.

## See also

- [Specification](../../spec.md) — the canonical TASKS.md format
- [Root README](../../README.md) — project overview and quick start
- [`@tasks-md/cli`](../cli/) — `tasks watch --fix` reuses this lint backend
- [`@tasks-md/parser`](../parser/) — shared parser the linter calls
- [`tasks-mcp`](../mcp/) — MCP server for read/write access
- [User story 01](../../docs/user-stories/01-agents-know-what-to-work-on.md) — lint rule reference in context

## License

[MIT](../../LICENSE)
