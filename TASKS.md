# Tasks

## P1

- [ ] Publish all packages to npm
  - **ID**: publish-all
  - **Tags**: tooling
  - **Details**: All prep done — READMEs, publishConfig, repo URLs fixed, dry-run passes.
    Run `npm adduser` then `scripts/publish-all.sh`. Order: `@tasks-md/parser` →
    `tasks-lint` → `tasks-mcp` → `@tasks-md/cli`.
  - **Acceptance**: All 4 packages installable via npm/npx

## P3

- [ ] Set up publish workflow for GitHub Actions
  - **ID**: publish-action
  - **Tags**: tooling
  - **Details**: The `tasks-lint` GitHub Action at `.github/actions/lint/` is ready but
    depends on `tasks-lint` being published to npm. Once publish-all is done, verify the
    action works in a test repo.
  - **Blocked by**: publish-all
  - **Acceptance**: `uses: tasksmd/tasks.md/.github/actions/lint@main` works in external repos

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
