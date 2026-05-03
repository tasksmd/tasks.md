# User Story: Each Team Member Has Their Own Queue

> In a monorepo, each team member or team owns their own task queue — agents work across all of them, prioritizing globally.

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

### How routing is enforced

Tag routing is enforced at the **`pick`/`list` filter call site, not in the parser**. The parser just records `**Tags**:` as a list — it doesn't know which agent should pick what. Concretely:

- `tasks pick --tags backend` (CLI) — passes the tag list to [`pickBestTask()`](../../packages/parser/src/index.ts), which filters candidates to those whose `**Tags**:` overlap. If no candidate matches, it falls back to the full set (tags are a soft preference).
- `tasks list --tag backend` (CLI) and the `tag` filter on the MCP `list_tasks` tool work the same way — the filter is applied in [`packages/cli/src/lib.ts`](../../packages/cli/src/lib.ts) and [`packages/mcp/src/tools.ts`](../../packages/mcp/src/tools.ts) respectively, both of which agree on the predicate.
- The `## Agents` block in `AGENTS.md` is **documentation of intent** — a contract between you and the agents. Actual enforcement happens because each agent passes its own tag list when calling `pick`/`list`. An agent that ignores its tag declaration will still be allowed to claim any task; the tag system is collaborative, not a sandbox.

This means orchestrators that route tasks programmatically (e.g., dispatching `pick --tags <agent-tags>` per agent process) get strong routing; ad-hoc human-driven agents with the same `AGENTS.md` are on the honor system.

## Linting Across Files

Pass all files to the linter for cross-file validation:

```bash
npx @tasks-md/lint TASKS.md packages/*/TASKS.md
```

This checks:
- Unique IDs across all files
- Blocker references resolved globally
- Format valid in every file
