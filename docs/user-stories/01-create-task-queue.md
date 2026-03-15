# User Story: Create a Task Queue

> As a developer, I want to create a task queue for my project so agents know what to work on without asking me.

## Quick Start ✓

```bash
tasks init
# Scaffolds TASKS.md with P0–P3 headings + adds Task Management section to AGENTS.md
```

Or install via npm and run anywhere:

```bash
npx tasks-mcp   # starts the MCP server (includes init via add_task)
```

## Steps (Manual — also works)

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

> **Implemented**: `tasks init` scaffolds both files in one command. See `scripts/tasks`.

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

## Files Involved

| File | Purpose |
|------|---------|
| `TASKS.md` | The task queue |
| `AGENTS.md` | Tell agents to read TASKS.md |
| [spec.md](../../spec.md) | Full specification |
