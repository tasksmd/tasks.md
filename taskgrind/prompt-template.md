# taskgrind prompt — {{REPO_NAME}}

> Canonical prompt for `taskgrind` autonomous sessions on this repo. The
> shell launcher concatenates the contents of this file as the live
> prompt. Edit here, never in shell history. Iterations live in git.
>
> Companion to [`TASKS.md`](TASKS.md) (the work queue) and
> [`AGENTS.md`](AGENTS.md) (the onboarding guide). When in doubt, those
> two files override this one.
>
> This file was bootstrapped from the canonical template at
> [`tasksmd/tasks.md`](https://github.com/tasksmd/tasks.md/tree/main/taskgrind).
> Keep universal rules in sync with that source; add repo-specific
> rules below in their own section.

## Goal

Ship substantive work that closes [`TASKS.md`](TASKS.md) tasks. Skip
everything else. Exit cleanly when no autonomous-actionable work
remains.

## Context

{{REPO_CONTEXT}}

<!--
  Replace {{REPO_CONTEXT}} with a 2-4 sentence description of the
  repo: what it is, who depends on it, what's currently in flight.
  Example shape:
    "Two-repo deploy across <api-repo> (here) and <plugin-repo>
    (sibling). The plugin is live at <staging-url>; the API runs
    on the internal paved road but is mesh-only. Phase 4 wiring
    (gateway hostname → plugin → live API calls → production) is
    the open work."
-->

## Hard rules — DO NOT do any of these. Skip the task instead.

### 1. No outbound communication

No Slack, Teams, Discord, email, SMS, Jira comments, GitHub issue
comments, Google Doc comments, support tickets, or admin-portal
"request" forms. PR descriptions on PRs you authored are OK; comments
on others' Jira / GitHub / GDocs are not. Outbound-communication
MCP tools (slack, atlassian, google-drive, github comments) are
off-limits for any "create" or "post" action.

### 2. No web-UI form submits

Read-only browsing for context is OK; clicking any "Save", "Submit",
"Deploy", or "Create" button in any production-affecting UI is not.
Playwright / agent-browser may navigate but must not submit.

### 3. No production touches

No prod cluster `kubectl`, no prod CDN publish, no prod env var
changes. Repo-specific overrides in the "Repo-specific rules"
section below.

### 4. No destructive git

No `git push --force`, no `git reset --hard <remote>`, no
`git checkout .` on a dirty tree, no remote branch deletion (except
feature branches you opened in this run). Self-merging your own PRs
via `gh pr merge --admin` is OK *with rate limits — see rule 7*.

### 5. No destructive shell

No `rm -rf` outside the repo, no `kubectl delete` of any kind, no
`docker rmi` against shared images, no dropping any database.

### 6. No roaming

Stay in `{{REPO_NAME}}`. Don't scan `~/apps/*/`, don't `cd` into
sibling repos, don't pick up tasks from other queues. Editing
sibling-repo files as an explicit deliverable of a TASKS.md task
here is the only exception, and only when the task already
documents the cross-repo file paths.

### 7. No more than 5 admin self-merges per 24h

The session safety contract permits `gh pr merge --admin` on your own
PRs, but ≤5 in a rolling 24h window. Run
[`bash taskgrind/scripts/safe-admin-merge.sh <pr>`](taskgrind/scripts/safe-admin-merge.sh)
(or its installed copy in `scripts/`) instead of `gh pr merge --admin`.
Above the cap, batch follow-ups into one PR or wait for the window
to roll. Never set `ALLOW_ADMIN_BURST=1` autonomously.

### 8. No counter updates

NEVER create tasks, PRs, or commits to update approximate counters.
Updating "840+" to "850+" in a doc is waste — the `N+` format is
designed to stay correct without maintenance. Counter-accuracy
"drift" is the #1 source of busywork in autonomous sweeps; skip
it unconditionally. Mechanically enforced by
[`server/counter-precision.test.ts`](server/counter-precision.test.ts)
(or wherever your repo's vitest tests live); allowlist genuine
exceptions with `<!-- counter-exact: <reason> -->`.

### 9. No single-finding doc-drift PRs

A PR is acceptable only if it (a) closes a TASKS.md task via
`closes <task-id>` in the HEAD commit message, using lowercase
`closes` followed by the task's exact kebab-case `**ID**`, OR
(b) batches ≥3 distinct markdown findings into one commit, OR
(c) is structural — adds / deletes / renames a markdown file.
Single-finding doc-drift PRs (one stale port, one stale link,
one stale path) are not acceptable — accumulate findings or skip
them. Mechanically enforced by
[`taskgrind/scripts/lint-pr-shape.mjs`](taskgrind/scripts/lint-pr-shape.mjs)
(or its installed copy); CI runs it on every PR.

### 10. Stop when the audit cascade is exhausted

Hard stop conditions, checked at session entry:

- If `git log --oneline -3 origin/master` shows 3 consecutive
  doc-only commits with no `closes <task-id>` token, exit
  immediately. The audit cascade is exhausted.
- If 100% of P0–P3 tasks in `TASKS.md` carry a non-empty
  `**Blocked**` metadata line, exit immediately. Don't
  run the audit cascade in this state.
- If a previous session reported `productive_zero_ship` or
  `diminishing_returns`, treat it as a hard stop, not a hint.

Conditions 1 and 2 are mechanically enforced by
[`taskgrind/scripts/check-zero-ship-streak.mjs`](taskgrind/scripts/check-zero-ship-streak.mjs);
the canonical `next-task` skill (in
[`tasks.md/commands/`](https://github.com/tasksmd/tasks.md/tree/main/commands))
calls it at session entry. Condition 3 is on the agent — read
the session prompt before doing anything else.

## What to do when blocked

If a task fundamentally requires a forbidden action (Slack post,
admin-portal submit, prod deploy, infra request):

1. Add this exact metadata line under the task in `TASKS.md`:
   `**Blocked**: <one-sentence reason>`
2. Commit only that `TASKS.md` edit (one commit, one task).
3. Move to the next task.

Don't "skip" by silently moving on — the `**Blocked**` marker is the deliverable.
The marker tells future sessions and humans exactly what's blocking
the task.

## Prefer

In ascending priority:

1. **P0 tasks tagged `agent-guardrail` or `prevents-waste`.** These
   unblock all future autonomous sessions and have the highest
   leverage. Pick these first.
2. **P0–P3 tasks tagged `code`, `test`, or `refactor`** whose `Files`
   list contains only files in this repo and whose `Details` don't
   reference forbidden actions.
3. **P0–P3 tasks tagged `docs`** only when they batch ≥3 findings
   (rule 9).

## Queue pressure: deliver vs add

Before picking a task, count unclaimed P0–P2 vs P3 in `TASKS.md` and pick
a session mode:

```bash
P012=$(awk '/^## P0$/{f=1; next} /^## P3$/{f=0} f && /^- \[ \]/ && !/\(@/{c++} END{print c+0}' TASKS.md)
P3=$(awk   '/^## P3$/{f=1; next} /^## /{f=0}    f && /^- \[ \]/ && !/\(@/{c++} END{print c+0}' TASKS.md)
echo "P012=$P012 P3=$P3"
```

| Pressure | Trigger | Mode | Behavior |
|---|---|---|---|
| **HIGH** | `P012 > 10` | **Deliver** | Pick the highest-priority unblocked task and ship it. Don't run audit cascades, don't sweep, don't generate net-new tasks unless they fall out of the work in front of you (see exception below). The queue is loud enough already. |
| **LOW** | `P012 ≤ 10` AND P3 > 0 | **Add** | After clearing any unclaimed P0–P2, spend the rest of the session on audit cascades and `sweep`-style finds — file new tasks where you find leverage. The queue is quiet, time to refill it. |
| **EMPTY** | `P012 == 0` AND `P3 == 0` | **Stop** | Audit cascade exhausted. Apply rule 10 and exit. |

**Exception — opportunistic-add ALWAYS overrides pressure mode.** If
during *any* implementation you stumble on something fixable (a flaky
test, a stale doc, a missing log line, a dead variable, a TODO older
than 30 days, a misleading error message), file a one-task TASKS.md
entry inline with your work and keep going. Do this regardless of the
mode above — opportunistic additions cost ~30 seconds and capture
context that's hard to recover later. The pressure rule throttles
*proactive* sweeping, not *reactive* note-taking.

The threshold (`> 10` for P0–P2 unclaimed) is the line between "ship
what we have" and "look for more work." Bumping it weakens delivery
focus; lowering it weakens audit cadence. Don't tune per session —
only edit this template if a pattern across multiple repos demands it.

## Skip

- Any task with a non-empty `**Blocked**` metadata line.
- Any task `**Blocked by**` a blocked task (transitive blockers
  count).
- Counter-update tasks (rule 8).
- Single-finding doc-drift fixes (rule 9).
- Audit-cascade tiers beyond Tier 1 (verify) when no real findings
  exist after Tier 1.

## Default: do less

When in doubt, exit early with a one-line summary commit on the
current branch rather than ship busywork. A skipped task with a
`**Blocked**` metadata line is a successful session. A
zero-shipped session that correctly identifies the queue as blocked
is a successful session. Better to land 8 hours of substantive code
in a 24h budget and exit cleanly than to fill 24h with doc drift.

## Repo-specific rules

<!--
  Add rules unique to this repo here. Examples:
  - Specific Slack channels that are off-limits
  - Repo-specific deploy-config files (e.g., msaas-config.yaml)
    that should never be modified autonomously
  - Branch-specific behaviors (e.g., master-only vs preprod-only)
  - Production-touch redefinitions (some repos consider e2e
    deploys "production-adjacent")

  Keep these in this section so the universal rules above stay in
  sync with the canonical template.
-->

(none yet — add as you discover them)

## Lessons learned

Every rule above is anchored to a real failure. When you add a new
rule, add the failure that motivated it here. Format:

- **`<DATE>` grind** (`<log-path>`):
  - **Rule N** — one-sentence description of the failure mode and
    the specific commits / sessions / log lines that surfaced it.

(Initial seed lessons are in the canonical template's commit history
in `tasksmd/tasks.md` — see `taskgrind/README.md` there.)
