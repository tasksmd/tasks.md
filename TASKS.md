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

## P3

- [ ] Add `tasks watch` command (auto-lint on file save)
  - **ID**: tasks-watch
  - **Tags**: tooling, ux
  - **Details**: Use `fswatch` (or `inotifywait` on Linux) to watch TASKS.md files
    and run `tasks-lint` on change. Print errors inline. Lightweight alternative to
    CI for local development. Add to `scripts/tasks` as a subcommand.
  - **Files**: `scripts/tasks`, `scripts/watch.sh`

- [ ] Add GitHub Actions reusable workflow for TASKS.md validation
  - **ID**: ci-action
  - **Tags**: tooling, ci
  - **Details**: Create `.github/workflows/tasks-lint.yml` as a reusable workflow
    that repos can reference. Story 09 shows inline YAML but a reusable workflow
    is easier to adopt. Publish alongside the npm packages.
  - **Files**: `.github/workflows/tasks-lint.yml`

- [ ] Add `sync-linear` bridge script (Linear → TASKS.md)
  - **ID**: sync-linear
  - **Tags**: integration, linear
  - **Details**: Same bridge pattern as `sync-issues.sh` and `sync-jira.sh` but
    for Linear. Map Linear priority (Urgent/High/Medium/Low/No priority) to P-levels.
    Use Linear API with `LINEAR_API_KEY`. Support `--merge` mode.
  - **Files**: `scripts/sync-linear.sh`

