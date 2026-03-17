# User Story: Agents Know What to Work On

> I want agents to start working immediately without asking me what to do — they read TASKS.md and go.

## Quick Start ✓

```bash
tasks init
# Scaffolds TASKS.md with P0–P3 headings + adds Task Management section to AGENTS.md
```

Or install via npm and run anywhere:

```bash
npx tasks-mcp   # starts the MCP server (includes init via add_task)
```

## Manual Alternative

1. **Create the file** at your repo root:
   ```markdown
   # Tasks

   ## P0

   - [ ] Fix authentication crash on token refresh
     - **Details**: JWT refresh returns 500 on expired tokens

   ## P1

   - [ ] Add rate limiting to public API endpoints
   - [ ] Migrate database queries to prepared statements

   ## P2

   - [ ] Update README with new API endpoints
   ```

2. **Tell agents about it** — add to your `AGENTS.md`:
   ```markdown
   ## Task Management
   - Read TASKS.md for available work before asking the user
   - Claim tasks by appending (@your-name) before starting work
   - Remove completed tasks from the file (history is in git log)
   ```

3. **Commit both files**.

That's it. Your agent reads TASKS.md on session start and works through the queue.

> **Implemented**: `tasks init` scaffolds both files in one command. See `packages/cli/`.

## The Format

**Priority headings** — `## P0` through `## P3`:

| Heading | When to use |
|---------|-------------|
| `## P0` | System is broken or users are blocked. Drop everything. |
| `## P1` | Core work that should ship. Default for planned features. |
| `## P2` | Valuable but not blocking. Do after P0 and P1 are clear. |
| `## P3` | Someday. Kept for reference, not actively worked. |

**Tasks** — Markdown checkboxes with a short imperative description:

```markdown
- [ ] Fix the race condition in WebSocket reconnect
```

**Metadata** — optional nested fields for context:

```markdown
- [ ] Fix the race condition in WebSocket reconnect
  - **ID**: ws-reconnect
  - **Tags**: backend, websocket
  - **Details**: Clients miss messages during reconnect window
  - **Files**: `src/ws/client.ts`, `src/ws/server.ts`
  - **Acceptance**: No dropped messages in integration test
  - **Blocked by**: auth-fix
```

All metadata is optional. A bare checkbox is a valid task.

## When to Add Metadata

| Situation | What to add |
|-----------|------------|
| Other tasks depend on this one | **ID** (so they can reference it in **Blocked by**) |
| Task needs context beyond the summary | **Details** |
| You know which files to touch | **Files** |
| "Done" isn't obvious | **Acceptance** |
| Multiple agents with specialties | **Tags** |

## Completion

When a task is done, the agent **removes the entire block** — task line, metadata, sub-tasks. No checking the box. Git log is the history.

## Keeping the Queue Valid

`@tasks-md/lint` validates TASKS.md files against the spec — run it locally, in CI, or on file save.

### What it catches

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

### Run locally

```bash
npx @tasks-md/lint TASKS.md                    # single file
npx @tasks-md/lint TASKS.md packages/          # monorepo
npx @tasks-md/lint --fix TASKS.md              # auto-fix deterministic issues
tasks lint TASKS.md                            # via the tasks CLI
```

Auto-fix handles: removing completed tasks, empty priority sections, normalizing ID casing, and removing orphaned metadata.

### Watch mode

```bash
tasks watch          # auto-lint on every save
tasks watch --fix    # auto-lint and auto-fix on every save
```

### Add to CI

Use the reusable workflow — no local setup needed:

```yaml
name: Lint TASKS.md
on: [push, pull_request]

jobs:
  lint:
    uses: tasksmd/tasks.md/.github/workflows/tasks-lint.yml@main
```

Or inline:

```yaml
- name: Lint TASKS.md
  run: npx @tasks-md/lint TASKS.md
```

### Pre-commit hook

```bash
#!/bin/bash
npx @tasks-md/lint TASKS.md || exit 1
```

## Files Involved

| File | Purpose |
|------|---------|
| `TASKS.md` | The task queue |
| `AGENTS.md` | Tell agents to read TASKS.md |
| [`packages/lint/`](../../packages/lint/) | Linter (TypeScript, [`@tasks-md/lint`](https://www.npmjs.com/package/@tasks-md/lint)) |
| [`packages/cli/`](../../packages/cli/) | Unified CLI (`tasks lint`, `tasks pick`, etc.) |
| [spec.md](../../spec.md) | Full specification |
