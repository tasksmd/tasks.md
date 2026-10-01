# User Story: Standing Audit Loops in Practice

> A recurring queue-filling pass — drop one task block into `TASKS.md`, and any agent can run the audit on demand without reciting a long prompt.

[Story 08](08-rich-task-metadata.md#standing-audit-loops) introduces the pattern: a single task that asks an agent to *queue* follow-up work instead of fixing the findings immediately. This story walks through one full cycle — when to reach for the pattern, the exact TASKS.md shape, how `/next-task` and `tasks pick` handle it, the audit run itself, and the anti-pattern to avoid.

## When to reach for one

Use a standing audit loop when:

- **Recurring queue refill** — the queue tends to drain to empty between audits, and you want a single trigger that any agent can invoke to refill it with the next batch of work.
- **Scheduled audit cadence** — you want a quarterly README/docs/dependency sweep to run in-band with normal work, but you don't want every agent to internalize a long audit prompt.
- **Post-deploy checklist** — after a release, an agent walks the user-facing surfaces (CLI help, README examples, story walkthroughs) and queues anything that drifted.
- **Onboarding-friendly audits** — a new contributor or new agent runs the loop and ends up with a concrete TASKS.md, not a wall of TODOs.

Don't use it for ordinary feature work. The loop only adds tasks; it never implements them. Promoting routine implementation tasks into standing loops is the anti-pattern called out [below](#anti-pattern-dont-over-loop).

## The shape

The canonical TASKS.md block — a single P2 task carrying the `standing-loop` tag and an `**ID**` that everyone in the repo can `/next-task` against:

```markdown
## P2

- [ ] Run the standard audit gap loop and queue follow-up work
  - **ID**: standing-audit-gap-loop
  - **Tags**: standing-loop, audit, queue
  - **Details**: Use the standard standing audit loop. Repo-specific inputs:
    - Compare `README.md`, `docs/user-stories/`, and current CLI help output
    - Check the competitor notes in `docs/VISION.md`
    - Ignore deployment tasks; this repo is local-only
  - **Files**: `README.md`, `docs/user-stories/`, `docs/VISION.md`, `TASKS.md`
  - **Acceptance**: TASKS.md contains deduplicated tasks for every actionable
    gap found, or the commit explains that no gaps were found. No source
    files changed outside TASKS.md.
```

Three pieces matter:

- `**Tags**: standing-loop, ...` — `pickBestTask()` and `/next-task` use this tag to skip the task during automatic queue-walking. Without the tag, the audit would compete for normal pick attention.
- `**ID**: standing-audit-gap-loop` — a stable handle so `/next-task standing-audit-gap-loop` (or `pick_task` with `task_id`) hits exactly this entry. Use whatever ID makes sense for the audit; the example above is the convention.
- `**Details** + **Files**` — repo-specific audit inputs. Without these, the agent falls back to README, AGENTS.md, user stories, and recent git history (per [`spec.md`](../../spec.md#standing-audit-loops)).

## How agents pick it up

The pattern is "opt-in only": automatic queue-walking skips it; targeted invocation runs it.

**Skipped during normal queue walks.** `pickBestTask()` filters out every task whose `**Tags**:` includes `standing-loop`, no matter the priority. That keeps the audit out of the way until someone explicitly asks for it.

```bash
tasks pick                         # walks P0→P3 — skips the standing-loop task
tasks pick --json                  # same, structured output
```

**Targeted on demand.** Pass the exact `**ID**` to `/next-task` or `pick_task`:

```bash
/next-task standing-audit-gap-loop
```

```text
pick_task(task_id="standing-audit-gap-loop", agent_name="cascade")
# returns { status: "ready" | "claimed" | "resumed", task: {...} }
```

The targeted path bypasses the priority sort and the standing-loop skip, but it still respects every other gate — claims, blockers, missing/duplicate IDs — so a stale claim or a `**Blocked**` reason still stops the run. This is pinned by `pickBestTask and standing-loop tasks` in [`packages/parser/src/index.test.ts`](../../packages/parser/src/index.test.ts) and the matching cases in `packages/cli/src/cli.test.ts` and `packages/mcp/src/tools.test.ts`.

## The agent's audit pass

When the loop runs, the agent's job is to *queue* findings, not to *fix* them. From [`spec.md`](../../spec.md#standing-audit-loops):

1. **Treat `**Details**` and `**Files**` as the audit brief.** If they're sparse, fall back to README, AGENTS.md, user stories, package scripts, and recent git history.
2. **Audit only.** Read files, run local read-only checks, inspect behavior — but don't implement code or docs fixes the audit surfaces.
3. **Add or refine actionable tasks** in TASKS.md with IDs, tags, details, files, and acceptance criteria. Avoid duplicates by checking existing task IDs and summaries first.
4. **Remove the standing-loop block in the same commit** that adds the follow-up tasks. If no gaps are found, remove the task and let the commit message explain that the audit found no queue additions.
5. **Stop after the audit commit.** When the loop is invoked as `/next-task standing-audit-gap-loop`, control returns to the user; the next normal `/next-task` invocation can implement the newly queued work.

This is the Tier-1/Tier-2 pattern: tier 1 is *find gaps*, tier 2 is *queue them as concrete tasks*. Implementation is left for normal queue-walking sessions, where each finding is just another P0–P3 task with regular metadata.

A typical commit message:

```text
chore: standing audit gap loop — queue 4 README + story drifts

- adds: readme-quickstart-typo, story-03-table-drift,
  cli-help-pick-stale, sync-jira-readme-jql-example
- removes: standing-audit-gap-loop (will be re-added in the next
  refill batch)

closes standing-audit-gap-loop
```

The standing-loop block is gone after the commit; the four new findings join the regular queue. A later `/next-task` session will pick whichever is highest-priority, claim it, fix it, and ship it under its own task ID.

## Anti-pattern: don't over-loop

Standing audit loops are appealing — one block, recurring value — but the failure mode is real: turning every recurring task into a standing loop converts the queue into a queue of audit prompts that never finish work.

Symptoms to watch for:

- Multiple `standing-loop` blocks in the same TASKS.md, each describing a slightly different audit. After a few sessions, each loop's findings recreate the next loop, and no implementation lands.
- A standing loop whose **Acceptance** is "audit findings get implemented in this same commit" — that's not a standing loop, that's a regular task. Remove the `standing-loop` tag and let it ride the normal queue.
- Loops scoped so broadly (`**Details**: review the whole codebase`) that the agent must invent a focus every run, producing inconsistent batches of tasks.

Rule of thumb:

> One standing loop per repo. If you want a second one, ask whether the first one's brief can absorb the new audit instead.

When in doubt, write the audit as a normal task ("Review CLI help text against PR #67's regex; queue any drifters") and let `/next-task` pick it on its own merit.

## Files Involved

| File | Purpose |
|------|---------|
| [`spec.md`](../../spec.md#standing-audit-loops) | Authoritative rules for standing audit loops |
| [`examples/complex-tasks.md`](../../examples/complex-tasks.md) | Includes a full standing-loop block alongside other rich-metadata tasks |
| [`packages/parser/src/index.ts`](../../packages/parser/src/index.ts) | `pickBestTask()` skips `standing-loop`-tagged tasks during automatic selection |
| [`packages/cli/src/cli.test.ts`](../../packages/cli/src/cli.test.ts) | Pins the CLI skip + targeted-pick contract |
| [`packages/mcp/src/tools.test.ts`](../../packages/mcp/src/tools.test.ts) | Pins the MCP skip + targeted-pick contract |
| [Story 08](08-rich-task-metadata.md#standing-audit-loops) | Introduces the pattern alongside the other rich-metadata fields |

## Try it yourself

Sixty-second walkthrough — a queue with one normal task and one standing-loop task. `tasks pick` picks the normal task; `/next-task standing-audit-gap-loop` (simulated below with `tasks pick --json` after deletion) targets the loop directly.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q
cat > TASKS.md <<'EOF'
# Tasks

## P2

- [ ] Document the new pagination flag

- [ ] Run the standard audit gap loop and queue follow-up work
  - **ID**: standing-audit-gap-loop
  - **Tags**: standing-loop, audit, queue
  - **Details**: Compare README, docs/user-stories/, and current CLI help.
  - **Files**: README.md, docs/user-stories/, TASKS.md
  - **Acceptance**: TASKS.md contains deduplicated tasks for every actionable
    gap, or the commit explains no gaps were found. No source files changed.
EOF
npx -y @tasks-md/cli pick                   # picks "Document the new pagination flag"
npx -y @tasks-md/cli list --priority P2     # shows BOTH tasks (list does not skip standing loops)
npx -y @tasks-md/lint TASKS.md              # exits 0 — both task shapes are valid
cd .. && rm -rf tmp-tasks-demo
```

Expected highlights:

```
Picked "Document the new pagination flag" (P2)
  Candidates: 1
```

`Candidates: 1` is the proof that the standing-loop task was filtered out — the queue has two checkbox tasks, but `pickBestTask` skipped the one tagged `standing-loop`. To run the audit, an agent (or a human invoking `/next-task standing-audit-gap-loop`) calls the targeted code path, which bypasses the skip and returns the loop directly.
