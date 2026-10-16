# Decision: projection-to-main snapshot freshness

- **Task**: decide-projection-to-main-snapshot-freshness
- **Repo**: ~/apps/tooling/tasks.md
- **Author**: claude session 2026-10-16
- **Status**: decided

## Question

The projection job force-pushes a fresh `TASKS.md` to the
`tasksmd/generated-snapshot` branch. Its step was named "Open/update the
snapshot PR", but it opens no PR. So `main`'s `TASKS.md` lags the live log
until a person refreshes it. Should the projection auto-merge a PR, commit to
`main` directly, or keep a manual gate? And what freshness does each surface
promise?

## Evidence (gathered 2026-10-16)

| Fact | Source |
| --- | --- |
| The snapshot branch was last updated at 12:36Z today; the job runs every 15 minutes plus on `repository_dispatch`. | `gh api repos/tasksmd/tasks.md/branches/tasksmd/generated-snapshot` |
| `main`'s `TASKS.md` changed 3 times in 15 days, each in a human-driven PR. | `git log -- TASKS.md` |
| `main` has a ruleset with a required `claim-check` status and no force-push. A direct bot push to `main` has no passing check, so it is rejected. | `gh api repos/tasksmd/tasks.md/rulesets` |
| GitHub rejects the `github-actions` app as a ruleset bypass actor on this repo (HTTP 422). | task `protect-tasks-claims-and-main-from-force-push-delete-with-co` |
| A PR opened with `GITHUB_TOKEN` does not trigger other workflows, so its required `claim-check` never reports and the PR cannot merge. | GitHub Actions docs: "Triggering a workflow from a workflow" |
| Agents and tools already read the log, not the file: `tasks list` / `tasks pick` fold `tasks-claims`. | `docs/editing-rules.md` § Task Queue Policy |

## Options

1. **Auto-merge a snapshot PR.** Needs a PR that triggers the required check.
   With `GITHUB_TOKEN` it cannot; it needs a GitHub App or a PAT. That adds a
   long-lived credential for a cosmetic file.
2. **Commit to `main` directly.** Blocked by the required-check ruleset unless
   the bot can bypass it, and GitHub rejects that bypass actor here. A PAT plus
   an admin bypass would work, but it weakens the `main` gate that protects code.
3. **Keep the manual gate, and state the freshness contract honestly.** The
   log is real time, the snapshot branch is at most one schedule interval
   behind, and `main`'s copy is a convenience copy with no freshness promise.

## Recommendation

**Option 3.** Freshness that matters is already real time: every tool reads
the log. A fresher `main` copy would cost a long-lived credential or a weaker
`main` gate, and neither is worth it for a generated file.

Delivered with this decision:

- `spec.md` § Generated `TASKS.md` projection states the three-tier freshness
  contract.
- The projection step is renamed "Update the snapshot branch" in this repo's
  workflow and the `tasks fleet init` template, so it no longer promises a PR.

No follow-up task: a repo that wants a fresh `main` copy can add a GitHub App
token and a PR step later; that is a per-repo choice, not spec work.
