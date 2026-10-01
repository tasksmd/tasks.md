# User Story: Tasks That Agents Complete Without Asking

> I want every task to be clear enough that agents complete it autonomously — no follow-up questions, no guessing.

## The Principle

A task is a small contract. The more specific, the better the result. Both humans and agents add tasks — agents discover work during implementation and add follow-up tasks to the queue. Most tasks don't need much — a clear one-liner is often enough.

## One-Liners (Most Tasks)

For obvious work, a single line is fine:

```markdown
- [ ] Add input validation to the /users endpoint
- [ ] Fix typo in README installation section
- [ ] Remove deprecated `legacy_auth` module
```

The agent knows the codebase. It can figure out the details.

## Rich Tasks (When Context Matters)

When the task is ambiguous, add metadata so the agent doesn't guess wrong:

```markdown
- [ ] Fix race condition in WebSocket reconnect
  - **Details**: When the server restarts, clients reconnect but sometimes
    miss messages sent during the reconnect window. Add a sequence number
    to messages and request missed messages after reconnecting.
  - **Files**: `src/ws/client.ts`, `src/ws/server.ts`
  - **Acceptance**: No dropped messages during server restart in integration test
```

## Tips

### Size it right

Each task should be completable in a single agent session. If you need more than a sentence to describe it, it might be two tasks.

Too big:
```markdown
- [ ] Build the authentication system
```

Right size:
```markdown
- [ ] Set up auth database schema
  - **ID**: auth-schema
- [ ] Implement JWT token generation
  - **Blocked by**: auth-schema
- [ ] Add login endpoint
  - **Blocked by**: auth-schema
```

### Include file paths

Agents explore faster when they know where to look:

```markdown
- [ ] Add retry logic to payment webhook handler
  - **Files**: `src/webhooks/stripe.ts`, `tests/webhooks/stripe.test.ts`
```

### Define "done"

An **Acceptance** field turns a vague ask into a testable outcome:

```markdown
- [ ] Add pagination to the /products endpoint
  - **Acceptance**: Returns 20 items per page, supports `?page=N`,
    returns `total_pages` in response, tests cover edge cases
```

### Use imperative mood

Start with a verb — "Add", "Fix", "Remove", "Migrate", "Refactor":

| ❌ Vague | ✅ Clear |
|---------|---------|
| Authentication issue | Fix token refresh returning 500 |
| Database performance | Add index on `users.email` column |
| Better error messages | Return specific error codes from /api/auth |

### Default to P2

If you're not sure about priority, use P2. It means "valuable but not blocking" — the agent will get to it after P0 and P1 are clear.

## The Metadata Fields

| Field | When to use | Example |
|-------|------------|---------|
| **ID** | Other tasks reference it as a blocker — see [Story 04](04-agents-work-in-right-order.md) | `auth-schema` |
| **Tags** | Multiple agents with specialties — see [Story 05](05-separate-queues-per-member.md#tag-based-routing) | `backend, auth` |
| **Details** | Implementation guidance needed | Free-form text |
| **Files** | You know which files to touch | `src/auth.ts` |
| **Acceptance** | "Done" isn't obvious | Testable criteria |
| **Blocked by** | Must wait for another task — see [Story 04](04-agents-work-in-right-order.md) | `auth-schema` |

All are optional. Use only what helps the agent succeed. For agent-managed fields (`**Blocked**`, `**Research**`, `**Last-enriched**`, `**Parent**`) and project-level policies, see [Story 08](08-rich-task-metadata.md).

## Try it yourself

Sixty-second walkthrough — write one rich task and one bare task, see which one `tasks pick` reaches first.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q
cat > TASKS.md <<'EOF'
# Tasks

## P1

- [ ] Add pagination to /products endpoint
  - **Files**: src/products/handler.ts
  - **Acceptance**: Returns 20 items/page; supports ?page=N

- [ ] Fix typo in README
EOF
npx -y @tasks-md/cli pick                    # picks the first P1 task
npx -y @tasks-md/lint TASKS.md               # exits 0 — both shapes are valid
cd .. && rm -rf tmp-tasks-demo
```

The pick output names the chosen task and reports `Candidates: 2`, confirming the queue had two pickable tasks. The rich one is what an agent would actually pick up — `Files` and `Acceptance` answer the questions a one-liner leaves open.
