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

   All other labels become **Tags**.

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

All three providers share one command — `tasks sync <provider>` — and the same bridge pattern: import the "what" from your tracker so agents can execute the "how".

## Files Involved

| File | Purpose |
|------|---------|
| `packages/cli/` | Unified CLI (`tasks sync github`, `tasks sync jira`, `tasks sync linear`) |
| `packages/cli/src/sync/github.ts` | GitHub Issues sync adapter |
| `packages/cli/src/sync/jira.ts` | Jira sync adapter |
| `packages/cli/src/sync/linear.ts` | Linear sync adapter |
