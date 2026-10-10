### Enrich blocked tasks {#enrich-blocked-tasks}

When every remaining task in the current repo is blocked — either by an unresolved `**Blocked by**:` or by a `**Blocked**:` reason — don't just roam. Spend this turn **enriching** the blocked tasks with read-only research so the developer has less discovery work to do once the block resolves.

**Pick one blocked task.** Prefer, in order:

1. Highest priority (P0 → P1 → P2 → P3).
2. Most downstream consumers — tasks whose `**Blocked by**:` references this task's `**ID**` are waiting on it; enriching those blockers pays compounding interest.
3. Staleness — pick a task whose `**Last-enriched**` field is missing or older than 7 days. Skip tasks enriched more recently than that. If every blocked task has a fresh `**Last-enriched**`, move on to **Empty queue: roam to the next repo** in SKILL.md instead.

**Research, read-only.** No file edits outside TASKS.md, no shell side-effects, no network writes. The agent may:

- Re-read the task's full metadata block.
- Read the files listed in `**Files**:`.
- `grep` the codebase for terms from the task summary, details, and IDs.
- Read `AGENTS.md`, `README.md`, relevant docs, and recent git log entries.
- For `**Blocked**:`-by-reason tasks:
  - If the block is about posting publicly (Slack, Jira, GitHub issues), draft the **exact** message text the user would paste, list the surface + recipients, and note any links or ping targets. Sample tone from prior posts in git log or pinned docs.
  - If the block is about credentials or environment access, document which credentials are needed, who owns them, and where the request goes.
  - If the block is a refused policy, document alternatives the user could consider.
- For `**Blocked by**:` dependency tasks:
  - Read the blocker task's current state (metadata, any WIP branches, related PRs) and note what it will produce.
  - Sketch the consuming approach: where the new code will live, which tests it will add, and which acceptance criteria will carry over.

**Append findings to the task block.** Stage only the hunks inside the task's own block — never touch unrelated tasks, and never touch the task's `**Blocked**` or `**Blocked by**` lines.

1. Extend `**Research**:` with today's notes. The first dated heading goes on the same line as the field label; body text follows on 4-space-indented continuation lines. When you accumulate over sessions, append a blank line + a new dated subheading to the existing field:

   ````markdown
     - **Research**: 2026-04-20 — draft message
       :rocket: v1.2 is live — highlights:
       • Rate limiter now honors `X-Api-Key` headers
       • Webhook processor is idempotent by event ID
       Deploying 09:00 Pacific; rollback plan in runbooks/rate-limiter.md.
       Recipients: #eng-announcements, #customer-success.
   ````

   Don't overwrite prior research — append a new heading under the same field. The parser treats indented continuation lines (4+ spaces) as part of the value, so the Research field stays a single growing string.

2. If research surfaced new files worth knowing about, append them to `**Files**:`. Don't rewrite the author's existing entries.
3. If research surfaced sharper acceptance criteria, append them to `**Acceptance**:`. Again, append — don't edit the author's text.
4. Stamp the task with `**Last-enriched**: YYYY-MM-DD` using today's UTC date. If the field already exists, overwrite it with today's date.

**Commit and move on.** Stage only the blocked task's hunk; the commit message should be:

```
chore: enrich <task-id> with research notes
```

Do not claim the task. Do not push to any public surface (the work stayed local to TASKS.md, which is what you already commit on a feature branch or directly on main depending on the repo's workflow).

After committing, return to **Find the queue** in SKILL.md. The task is still blocked — the next pick step will skip it because the `**Blocked**` / `**Blocked by**` line is still there — but it's now richer for the next session or the human reviewer.

> **MCP shortcut:** If `tasks-mcp` is available, use `enrich_task` — it appends `**Research**` notes, optionally extends `**Files**` / `**Acceptance**`, and sets `**Last-enriched**` atomically without manual file editing.
