# User Story: Sync from GitHub Issues

> As a team using GitHub Issues for product work, I want to generate a TASKS.md from labeled issues so agents can execute without needing GitHub API access.

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

## Files Involved

| File | Purpose |
|------|---------|
| `scripts/sync-issues.sh` | Issue sync script |
