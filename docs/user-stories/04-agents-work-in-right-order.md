# User Story: Agents Work in the Right Order

> I want agents to respect dependencies automatically — no manual sequencing, no wasted work on blocked tasks.

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

## The Actual Algorithm

`pickBestTask()` in [`packages/parser/src/index.ts`](../../packages/parser/src/index.ts) is the source of truth for ordering. Both the CLI (`tasks pick`) and the MCP server (`pick_task`) call it directly, so behavior cannot drift. The algorithm:

1. **Collect candidates** — every task in every discovered `TASKS.md`, then drop tasks that are claimed (`(@agent)`), blocked (non-empty `**Blocked**` OR a `**Blocked by**` ID still present in the queue), or marked with the `standing-loop` tag.
2. **Tag preference** — if the caller passed `--tags backend, infra`, narrow to tasks with at least one matching tag. If no candidate matches, fall back to the full set (tags are a soft preference, not a hard filter — see Story 05 for the contract).
3. **Sort** by, in order:
   - **Priority** — `P0 < P1 < P2 < P3` lex-sorted (P0 first).
   - **Unblocking impact** — descending count of tasks that name this task's ID in their `**Blocked by**` field.
   - **Tag overlap count** — descending number of caller-supplied tags this task carries.
4. **Pick** the first candidate; the rest are returned as `candidateCount` for inspection.

A task is unblocked when **none** of its `**Blocked by**` IDs match a `**ID**:` value still present in any discovered `TASKS.md`. Removing the blocker's task block from the file is what flips the dependent from blocked to pickable — there is no separate "unblock" command. `**Blocked**:` (free-form text) blocks the task too, but it can only be cleared by a human or by the agent removing the line.

This contract is pinned by unit tests in `packages/cli/src/cli.test.ts` (`pickBestTask` describe block) and `packages/mcp/src/tools.test.ts`. Any change to the ordering rules must update both test suites.

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

`@tasks-md/lint` catches common mistakes:

```bash
npx @tasks-md/lint TASKS.md
```

- Flags duplicate IDs
- Flags `Blocked by` references to non-existent IDs (dangling blockers)
- Validates ID format (must be kebab-case)

## Try it yourself

Sixty-second walkthrough — give two tasks the same priority but make one block the other; watch `tasks pick` favor the unblocking task.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q
cat > TASKS.md <<'EOF'
# Tasks

## P1

- [ ] Implement JWT generation
  - **Blocked by**: auth-schema

- [ ] Set up auth database schema
  - **ID**: auth-schema
EOF
npx -y @tasks-md/cli pick                    # picks the schema task
npx -y @tasks-md/lint TASKS.md               # exits 0 — `auth-schema` ID resolves
cd .. && rm -rf tmp-tasks-demo
```

Expected highlights:

```
Picked "Set up auth database schema" (P1)
  ID: auth-schema
  Unblocks: 1 task(s)
  Candidates: 1
```

`Candidates: 1` is the proof that the JWT task was filtered out — its `**Blocked by**: auth-schema` matched a still-present ID. Remove the schema task block (as the agent would after completing it) and re-run `pick`; the JWT task becomes the candidate.
