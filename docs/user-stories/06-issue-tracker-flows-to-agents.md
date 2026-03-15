# User Story: Issue Tracker Decisions Flow to Agents Automatically

> Decisions made in GitHub Issues, Jira, or Linear flow into TASKS.md automatically — agents execute without needing API access.

## How It Works

The `sync-issues.sh` script fetches open GitHub Issues with a specific label and generates a valid TASKS.md file with proper priority headings, IDs, and tags.

```bash
scripts/sync-issues.sh --label tasks.md --output TASKS.md
```

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
   scripts/sync-issues.sh --output TASKS.md
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
scripts/sync-issues.sh [--repo OWNER/REPO] [--label LABEL] [--output FILE]
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--repo` | Current repo (from `gh`) | Target GitHub repo |
| `--label` | `tasks.md` | Issue label to filter by |
| `--output` | stdout | Output file path |

## Running in CI

Automate the sync with a GitHub Actions workflow:

```yaml
- name: Sync issues to TASKS.md
  run: scripts/sync-issues.sh --output TASKS.md
  
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
scripts/sync-issues.sh --merge --output TASKS.md
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

They complement each other. One issue often becomes multiple tasks. `sync-issues.sh` is the bridge — it imports the "what" from your tracker so agents can execute the "how".

## Prerequisites

- `gh` CLI installed and authenticated
- Issues labeled with your filter label (default: `tasks.md`)

## Jira Sync

A companion script syncs from Jira using the same pattern:

```bash
scripts/sync-jira.sh --project PROJ --output TASKS.md
scripts/sync-jira.sh --project PROJ --merge --output TASKS.md
```

Jira priority mapping: Highest/Blocker/Critical → P0, High → P1, Medium → P2, Low/Lowest → P3. Labels become tags, issue keys become IDs (`jira-PROJ-123`). Requires `JIRA_URL` and `JIRA_TOKEN` environment variables.

## Linear Sync

A companion script syncs from Linear using the same pattern:

```bash
scripts/sync-linear.sh --team ENG --output TASKS.md
scripts/sync-linear.sh --team ENG --project "Q1 Launch" --merge --output TASKS.md
```

Linear priority mapping: Urgent → P0, High → P1, Medium → P2, Low/No priority → P3. Labels become tags, issue identifiers become IDs (`linear-ENG-123`). Requires `LINEAR_API_KEY` environment variable.

All three scripts implement the same bridge pattern — import the "what" from your tracker so agents can execute the "how".

## Files Involved

| File | Purpose |
|------|---------|
| `scripts/sync-issues.sh` | GitHub Issues sync script |
| `scripts/sync-jira.sh` | Jira sync script |
| `scripts/sync-linear.sh` | Linear sync script |
