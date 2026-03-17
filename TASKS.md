# Tasks

## P1

- [ ] Publish all packages to npm
  - **ID**: publish-all
  - **Tags**: tooling
  - **Details**: Publish in dependency order: `@tasks-md/parser` → `tasks-lint` →
    `tasks-mcp` → `@tasks-md/cli`. All packages have prepublishOnly scripts, README files,
    bin entries (where applicable), and version specifiers. Requires `npm adduser`
    authentication first. Verify name availability with `npm view` before publish.
  - **Acceptance**: All 4 packages installable via npm/npx

## P3

- [ ] Create GitHub Action for tasks-lint
  - **ID**: github-action
  - **Tags**: tooling, growth
  - **Details**: Create a reusable GitHub Action that runs tasks-lint on TASKS.md files.
    Users would add one line to their CI workflow. Major adoption lever — lowers barrier to
    entry for the spec. Could be as simple as a composite action that runs `npx tasks-lint`.
  - **Files**: `.github/actions/lint/action.yml` (new)
  - **Blocked by**: publish-all
  - **Acceptance**: Users can add `uses: tasksmd/tasks.md/.github/actions/lint@main` to CI

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
