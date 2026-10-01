# User Story: Issue Tracker Decisions Flow to Agents Automatically

> Decisions made in GitHub Issues, Jira, or Linear flow into TASKS.md automatically — agents execute without needing API access.

## How It Works

`tasks sync <provider>` fetches open issues from a tracker and generates (or merges into) a valid TASKS.md file with proper priority headings, IDs, and tags. Provider is one of `github`, `jira`, or `linear`.

```bash
tasks sync github --label tasks.md --output TASKS.md
```

The legacy commands `tasks sync-issues`, `tasks sync-jira`, and `tasks sync-linear` still work as deprecated aliases (one warning, then they forward to the new form).

## Steps

1. **Label issues for agent work** — add a `tasks.md` label to issues you want agents to pick up

2. **Set priority via labels** — the script maps issue labels to P-levels:

   | Issue label | TASKS.md priority |
   |-------------|------------------|
   | `critical`, `P0` | `## P0` |
   | `high`, `P1` | `## P1` |
   | `medium`, `P2` | `## P2` (default) |
   | `low`, `P3` | `## P3` |

   All other labels become **Tags**. Issues without any of the priority labels above default to **P2** — every provider (GitHub, Jira, Linear) follows this rule, so unscored work always lands in P2 rather than getting silently dropped.

3. **Run the sync**:
   ```bash
   tasks sync github --output TASKS.md
   ```

4. **Review and commit** the generated file.

## What Gets Generated

Each issue becomes a task with:
- **Summary** from the issue title
- **ID** as `issue-<number>` (stable, unique)
- **Tags** from non-priority labels (lowercased)

Example output:

```markdown
# Tasks

## P1

- [ ] Fix authentication crash on token refresh
  - **ID**: issue-42
  - **Tags**: backend, auth

## P2

- [ ] Add pagination to products endpoint
  - **ID**: issue-57
  - **Tags**: backend, api

- [ ] Update deployment docs
  - **ID**: issue-63
  - **Tags**: docs
```

## Options

```bash
tasks sync github [--repo OWNER/REPO] [--label LABEL] [--output FILE] [--merge]
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--repo` | Current repo (from `gh`) | Target GitHub repo |
| `--label` | `tasks.md` | Issue label to filter by |
| `--output` | stdout | Output file path |
| `--merge` | off | Preserve manual tasks; only add/remove synced tasks |

## Running in CI

Automate the sync with a GitHub Actions workflow:

```yaml
- name: Sync issues to TASKS.md
  run: tasks sync github --output TASKS.md
  
- name: Commit if changed
  run: |
    git diff --quiet TASKS.md || {
      git add TASKS.md
      git commit -m "chore: sync TASKS.md from GitHub Issues"
      git push
    }
```

## Merge Mode ✓

The `--merge` flag preserves existing tasks and only syncs changes:

```bash
tasks sync github --merge --output TASKS.md
```

- **Add** tasks for new issues (not yet in the file)
- **Remove** tasks for closed issues (matched by `issue-<number>` ID)
- **Preserve** manual tasks (those without `issue-` prefix IDs)

This makes the sync safe to run repeatedly — via CI or manually — without losing hand-written tasks.

## The Bridge Pattern

Issue trackers and TASKS.md solve different problems:

| | GitHub Issues | TASKS.md |
|--|---------------|----------|
| **Audience** | Product managers, teams | Agents |
| **Granularity** | Features, bugs, epics | Implementation steps |
| **Access** | API + auth | Read a file |

They complement each other. One issue often becomes multiple tasks. `tasks sync github` is the bridge — it imports the "what" from your tracker so agents can execute the "how".

## Prerequisites

- `gh` CLI installed and authenticated
- Issues labeled with your filter label (default: `tasks.md`)

## Jira Sync

The same pattern works for Jira:

```bash
tasks sync jira --project PROJ --output TASKS.md
tasks sync jira --project PROJ --merge --output TASKS.md
```

Jira priority mapping: Highest/Blocker/Critical → P0, High → P1, Medium → P2, Low/Lowest → P3. Labels become tags, issue keys become IDs (`jira-PROJ-123`). Requires `JIRA_URL` and `JIRA_TOKEN` environment variables.

## Linear Sync

The same pattern works for Linear:

```bash
tasks sync linear --team ENG --output TASKS.md
tasks sync linear --team ENG --project "Q1 Launch" --merge --output TASKS.md
```

Linear priority mapping: Urgent → P0, High → P1, Medium → P2, Low/No priority → P3. Labels become tags, issue identifiers become IDs (`linear-ENG-123`). Requires `LINEAR_API_KEY` environment variable.

**Label normalization** — Linear labels are normalized to TASKS.md tag conventions: lowercased and with whitespace replaced by `-` (so `Bug Fix` becomes `bug-fix`, `In Progress` becomes `in-progress`). This keeps tags consistent across providers since GitHub and Jira tags are already lowercased.

All three providers share one command — `tasks sync <provider>` — and the same bridge pattern: import the "what" from your tracker so agents can execute the "how".

## Walkthrough: GitHub issue to closed task

One full cycle, top to bottom — issue labeled in GitHub, synced into `TASKS.md`, picked, claimed, completed, then re-synced to confirm the loop is idempotent. The example uses [`octocat/hello-world`](https://github.com/octocat/hello-world) as the source repo and a `tasks.md`-labelled issue numbered `42`.

1. **Sync** — pull every issue with the `tasks.md` label and write them into `TASKS.md`:

   ```bash
   tasks sync github --repo octocat/hello-world --label tasks.md --output TASKS.md
   ```

   The hunk added to `TASKS.md` (one task per matching issue):

   ```markdown
   ## P2

   - [ ] Document the new pagination flag
     - **ID**: issue-42
     - **Tags**: docs, backend
   ```

2. **Pick** — `pickBestTask` selects this entry because it is the only available task:

   ```bash
   tasks pick
   # Picked "Document the new pagination flag" (P2)
   #   File: TASKS.md:5
   #   ID: issue-42
   #   Tags: docs, backend
   #   Candidates: 1
   ```

3. **Claim** — the agent appends its identity to the task line so other agents skip it:

   ```diff
   -- [ ] Document the new pagination flag
   +- [ ] Document the new pagination flag (@octocat-bot)
   ```

4. **Complete** — the agent removes the entire task block (task line + all metadata) and commits:

   ```bash
   git commit -m "docs: document the pagination flag

   closes issue-42"
   ```

5. **Re-sync (idempotency)** — running the same `--merge` sync again produces no diff: the original GitHub issue is still open, but the TASKS.md task has been removed by the agent. Without `--merge`, sync would re-add it — so always pair an automated cron sync with `--merge`:

   ```bash
   tasks sync github --repo octocat/hello-world --label tasks.md --merge --output TASKS.md
   # No diff — `issue-42` is still open in GitHub but already removed
   # from TASKS.md by the agent. --merge respects manual / agent edits.
   ```

   Closing the GitHub issue itself is a separate action (e.g. `gh issue close 42` after the PR merges); `tasks sync github --merge` will then drop the entry on the next run too if it ever reappears.

## Files Involved

| File | Purpose |
|------|---------|
| `packages/cli/` | Unified CLI (`tasks sync github`, `tasks sync jira`, `tasks sync linear`) |
| `packages/cli/src/sync/github.ts` | GitHub Issues sync adapter |
| `packages/cli/src/sync/jira.ts` | Jira sync adapter |
| `packages/cli/src/sync/linear.ts` | Linear sync adapter |

## Try it yourself

Sixty-second walkthrough — every provider lives behind the same `tasks sync <provider>` shape. The actual sync needs auth (`gh login`, `JIRA_URL`+`JIRA_TOKEN`, or `LINEAR_API_KEY`), but the help output is enough to confirm the flag set without leaving the shell.

```bash
mkdir tmp-tasks-demo && cd tmp-tasks-demo
git init -q
npx -y @tasks-md/cli sync --help             # one unified subcommand list
npx -y @tasks-md/cli sync github --help      # --repo, --label, --output, --merge
npx -y @tasks-md/cli sync jira --help        # --project, --jql, --output, --merge, --max
npx -y @tasks-md/cli sync linear --help      # --team (required), --project, --filter, ...

# When you're ready to sync — run only the line that matches your tracker:
#   npx -y @tasks-md/cli sync github --label tasks.md --output TASKS.md
#   npx -y @tasks-md/cli sync jira   --project PROJ   --output TASKS.md
#   npx -y @tasks-md/cli sync linear --team ENG       --output TASKS.md
# Re-running with `--merge` preserves manual tasks:
#   npx -y @tasks-md/cli sync github --label tasks.md --merge --output TASKS.md
cd .. && rm -rf tmp-tasks-demo
```

`tasks sync --help` should print exactly three subcommands (`github`, `jira`, `linear`) — that's the unified surface. The legacy `tasks sync-issues|sync-jira|sync-linear` aliases still work but print a deprecation warning the first time you call them.
