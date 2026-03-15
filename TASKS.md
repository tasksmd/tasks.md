# Tasks

## P1

- [ ] Publish and promote blog post: "Why your AI agent needs a backlog"
  - **Details**: Draft is at `docs/blog/why-your-ai-agent-needs-a-backlog.md`. Review,
    add to site navigation, and publish. Consider cross-posting to dev.to / HN.

## P2

- [ ] Publish tasks-mcp to npm
  - **ID**: publish-mcp
  - **Tags**: tooling, mcp
  - **Details**: Package is publish-ready: prepublishOnly runs build+test (104 tests),
    bin entry has shebang, test files excluded, README updated. Just needs `npm login`
    then `npm publish` from `mcp/`.
  - **Files**: `mcp/`

- [ ] Publish tasks-lint to npm
  - **ID**: publish-lint
  - **Tags**: tooling, lint
  - **Details**: Package is publish-ready: prepublishOnly runs test (22 tests),
    bin entry has shebang, README updated with --fix docs. Just needs `npm login`
    then `npm publish` from `lint/`.
  - **Files**: `lint/`

- [ ] Set up custom domain tasks.md for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md domain for a cleaner URL.

- [ ] Add `tasks stats` command — queue overview dashboard
  - **ID**: tasks-stats
  - **Tags**: cli, ux
  - **Details**: Show task count by priority (P0:2, P1:5...), blocked count, claimed
    count, and oldest task age. Useful for orchestrators and humans to quickly assess
    queue health without parsing the file. Implement in `scripts/tasks stats`.
  - **Files**: `scripts/tasks`

- [ ] Add pre-commit hook for TASKS.md validation
  - **ID**: tasks-precommit
  - **Tags**: ci, lint
  - **Details**: A git hook that runs `tasks-lint` on any staged TASKS.md files before
    commit. Catches formatting errors locally before CI. Add to `scripts/tasks install`
    as an optional step. Skippable with `--no-verify`.
  - **Files**: `scripts/tasks`, `docs/user-stories/09-lint-in-ci.md`

## P3

- [ ] Add Jira sync script (complement to GitHub Issues sync)
  - **ID**: jira-sync
  - **Tags**: integration, jira
  - **Details**: Similar to `sync-issues.sh` but for Jira. Map Jira priorities to P-levels,
    use issue keys as IDs (`jira-PROJ-123`), map labels to tags. Support `--merge` mode.
    Could use `gh` equivalent or Jira REST API. Extends the bridge pattern from story 10.
  - **Files**: `scripts/sync-jira.sh`

- [ ] Add `tasks diff` — show queue changes since last commit
  - **ID**: tasks-diff
  - **Tags**: cli, orchestrator
  - **Details**: Show tasks added, removed, and claimed since the last git commit.
    Useful for orchestrators monitoring progress (story 11) and for humans reviewing
    what agents accomplished in a session. Could be a `scripts/tasks diff` subcommand.
  - **Files**: `scripts/tasks`

