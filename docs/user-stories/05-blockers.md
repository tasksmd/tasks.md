# User Story: Use Blockers and Dependencies

> As a developer, I want to express task dependencies so agents work in the right order without me sequencing manually.

## How It Works

Give a task an **ID**. Reference that ID in another task's **Blocked by** field. The agent skips blocked tasks automatically.

```markdown
## P1

- [ ] Set up auth database schema
  - **ID**: auth-schema

- [ ] Implement JWT token generation
  - **Blocked by**: auth-schema

- [ ] Add login endpoint
  - **Blocked by**: auth-schema
```

The agent picks `auth-schema` first (it has the highest unblocking impact — two tasks depend on it). Once it's completed and removed from the file, the other two tasks become unblocked.

## Rules

- **IDs are kebab-case** — `auth-schema`, not `Auth Schema`
- **IDs are stable** — don't rename once assigned. Other tasks reference them.
- **IDs are unique** — across all TASKS.md files in the repo
- **Blockers resolve by absence** — a task is unblocked when the referenced ID no longer exists in any TASKS.md file (because the blocking task was completed and removed)
- **Multiple blockers** — comma-separated: `**Blocked by**: auth-schema, rate-limit`

## When to Use IDs

Not every task needs an ID. Only add one when:

1. **Another task depends on it** — so `Blocked by` can reference it
2. **Cross-file linking** — in monorepos with multiple TASKS.md files

A bare task with no dependencies doesn't need an ID:

```markdown
- [ ] Fix typo in README
```

## Unblocking Impact

Agents should prefer tasks that unblock other work. This is the most impactful heuristic for task selection:

```markdown
## P1

- [ ] Design API schema
  - **ID**: api-schema

- [ ] Build user endpoints
  - **Blocked by**: api-schema

- [ ] Build product endpoints
  - **Blocked by**: api-schema

- [ ] Write API documentation
  - **Blocked by**: api-schema

- [ ] Add request logging
```

Here, `api-schema` unblocks 3 tasks. `Add request logging` unblocks none. A smart agent picks `api-schema` first — even though both are P1.

## Chains

Dependencies can chain:

```markdown
- [ ] Set up database
  - **ID**: db-setup

- [ ] Create user table
  - **ID**: user-table
  - **Blocked by**: db-setup

- [ ] Add user registration endpoint
  - **Blocked by**: user-table
```

The agent works through them in order: `db-setup` → `user-table` → registration endpoint. Each completion unblocks the next.

## Cross-File Blockers

In monorepos with multiple TASKS.md files, blockers work across files:

```
packages/api/TASKS.md:
  - [ ] Build auth middleware
    - **ID**: auth-middleware

packages/web/TASKS.md:
  - [ ] Add login page
    - **Blocked by**: auth-middleware
```

The agent searches all TASKS.md files when resolving blockers.

## Linter Support

`tasks-lint` catches common mistakes:

```bash
node lint/index.js TASKS.md
```

- Flags duplicate IDs
- Flags `Blocked by` references to non-existent IDs (dangling blockers)
- Validates ID format (must be kebab-case)
