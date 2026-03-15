# User Story: Multi-File Setup

> As a monorepo maintainer, I want separate task queues per package so teams can manage their own work without stepping on each other.

## When to Split

Split when:
- A single TASKS.md exceeds ~50 tasks
- Teams working in different packages rarely overlap
- You want per-package ownership of the task queue

Don't split prematurely — one file works fine for most repos.

## Structure

```
my-project/
├── TASKS.md             # project-wide tasks (infra, cross-cutting)
├── packages/
│   ├── api/
│   │   └── TASKS.md     # API-specific tasks
│   └── web/
│       └── TASKS.md     # web-specific tasks
```

## Discovery

Agents find all TASKS.md files automatically:

1. Find the git root (directory containing `.git`)
2. Search for all `TASKS.md` files under the root (excluding `.git/`, `node_modules/`)
3. Sort by path (lexicographic) for deterministic order across machines
4. Read all files and consider tasks together

Tasks are prioritized **globally** — a P0 in `packages/web/TASKS.md` outranks a P1 in the root `TASKS.md`.

## Cross-File References

IDs must be unique across all files. Blockers reference IDs globally:

```markdown
# packages/api/TASKS.md
- [ ] Build auth middleware
  - **ID**: auth-middleware

# packages/web/TASKS.md
- [ ] Add login page
  - **Blocked by**: auth-middleware
```

The agent searches all TASKS.md files when resolving blockers. When `auth-middleware` is completed and removed from the API file, the web task becomes unblocked.

## Adding a Task to a Specific File

With the MCP server, specify the target file:

```
add_task(summary="Add caching layer", priority="P2", file="packages/api/TASKS.md")
```

Without MCP, just edit the file directly — it's Markdown.

## Tag-Based Routing

Use tags to route tasks to the right agent in multi-file setups:

```markdown
# packages/api/TASKS.md
- [ ] Add rate limiting
  - **Tags**: backend, api

# packages/web/TASKS.md
- [ ] Add dark mode toggle
  - **Tags**: frontend, ux
```

Declare agent capabilities in AGENTS.md:

```markdown
## Agents
- @backend-agent: tags backend, database, api
- @frontend-agent: tags frontend, ux
```

## Linting Across Files

Pass all files to the linter for cross-file validation:

```bash
node lint/index.js TASKS.md packages/*/TASKS.md
```

This checks:
- Unique IDs across all files
- Blocker references resolved globally
- Format valid in every file
