# User Story: Write Good Tasks

> As a developer, I want to write tasks that agents can actually complete — without asking me follow-up questions.

## The Principle

A task is a small contract between you and the agent. The more specific you are, the better the result. But most tasks don't need much — a clear one-liner is often enough.

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
| **ID** | Other tasks reference it as a blocker | `auth-schema` |
| **Tags** | Multiple agents with specialties | `backend, auth` |
| **Details** | Implementation guidance needed | Free-form text |
| **Files** | You know which files to touch | `` `src/auth.ts` `` |
| **Acceptance** | "Done" isn't obvious | Testable criteria |
| **Blocked by** | Must wait for another task | `auth-schema` |

All are optional. Use only what helps the agent succeed.
