# User Story: Integrate with an Orchestrator

> As an orchestrator, I decompose work into tasks, write them to TASKS.md, and let agents execute — using the file as the interface between planning and coding.

## The Pattern

```
┌─────────────┐     writes      ┌──────────┐     reads      ┌─────────┐
│ Orchestrator │ ──────────────> │ TASKS.md │ <────────────── │  Agent  │
│  (planner)   │                 │          │ ──────────────> │ (coder) │
└─────────────┘     reads       └──────────┘     writes      └─────────┘
                  completions                   claims/removes
```

1. **Orchestrator** decomposes a feature into implementation tasks and writes TASKS.md
2. **Agent** reads the file, claims a task, implements it, removes it when done
3. **Orchestrator** monitors the file, resolves blockers, adds follow-up tasks

## Separation of Concerns

| Role | Reads | Writes |
|------|-------|--------|
| **Orchestrator** | Completions (tasks removed = done) | New tasks, priority, metadata |
| **Agent** | Task queue (picks next unblocked task) | Claims, task removal on completion |

The orchestrator is the sole writer of new tasks. Agents report discovered work to the orchestrator instead of writing directly. This avoids merge conflicts from multiple agents appending to the same section.

Claiming and removing tasks is always done by the agent, regardless of setup.

## Tag-Based Routing

Use tags to route tasks to specialized agents:

```markdown
## P1

- [ ] Add database indexes for search queries
  - **Tags**: backend, database

- [ ] Build search results page
  - **Tags**: frontend, ux

- [ ] Write search API documentation
  - **Tags**: docs
```

Declare agent capabilities in AGENTS.md:

```markdown
## Agents
- @backend-agent: tags backend, database, infra
- @frontend-agent: tags frontend, ux
- @docs-agent: tags docs
```

### Matching Algorithm

1. **Untagged tasks** — available to any agent
2. **Tagged tasks** — ANY-match: an agent matches if it shares at least one tag with the task
3. Tags are a **soft preference** — if no specialist is available, any agent can claim
4. When multiple tasks match, prefer the one with the most overlapping tags

## Orchestrator Writes Tasks

When the orchestrator breaks down a feature:

```markdown
## P1

- [ ] Design user profile API schema
  - **ID**: profile-schema
  - **Tags**: backend
  - **Details**: REST endpoints for GET/PUT profile. Include avatar URL,
    display name, bio, and settings.
  - **Files**: `src/api/profile.ts`, `src/models/user.ts`
  - **Acceptance**: OpenAPI spec validates, TypeScript types generated

- [ ] Build profile page component
  - **Tags**: frontend
  - **Blocked by**: profile-schema
  - **Details**: Render user avatar, name, bio. Link to settings page.
  - **Files**: `src/pages/profile.tsx`
  - **Acceptance**: Matches Figma mockup, responsive, tests pass

- [ ] Add profile page to API docs
  - **Tags**: docs
  - **Blocked by**: profile-schema
```

The orchestrator sets priorities, adds dependencies, and includes enough context for each specialist to work independently.

## Monitoring Completions

The orchestrator monitors TASKS.md for removed tasks — each removal means a task was completed. It can then:

- Unblock dependent tasks (automatic — blockers resolve by absence)
- Add follow-up tasks ("profile page is done, now add analytics tracking")
- Report progress to the human or issue tracker
- Trigger the next phase of a multi-phase plan

## With the MCP Server

The orchestrator can use `tasks-mcp` tools for programmatic access:

```
add_task(summary="Build search results page", priority="P1", tags="frontend, ux")
list_tasks(unclaimed_only=true, unblocked_only=true)
```

This is cleaner than parsing Markdown directly, especially for orchestrators that manage multiple repos.

## Without an Orchestrator

TASKS.md works fine without an orchestrator. A solo developer writes tasks, one agent drains them. The orchestrator pattern is for teams running multiple specialized agents in parallel.
