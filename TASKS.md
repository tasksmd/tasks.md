# Tasks

## P1

- [ ] Fix lock file drift in packages/mcp
  - **ID**: fix-mcp-lockfile
  - **Tags**: tooling
  - **Details**: `packages/mcp/package-lock.json` still contains
    `"@tasks-md/parser": "file:../packages/parser"` even though `package.json` was updated
    to `"^0.1.0"`. The workspace resolution masks this locally, but it will cause issues
    when publishing. Regenerate the lock file after npm publish of parser, or delete it
    since workspace root lock file handles resolution.
  - **Acceptance**: No `file:` references in any package-lock.json

- [ ] Add type:module to root package.json
  - **ID**: root-esm
  - **Tags**: tooling
  - **Details**: `scripts/build-site.js` uses ES module features but root package.json
    lacks `"type": "module"`, causing a Node.js MODULE_TYPELESS_PACKAGE_JSON warning.
    Add the field and verify nothing breaks.
  - **Files**: `package.json`
  - **Acceptance**: `node scripts/build-site.js` runs without warnings

- [ ] Publish all packages to npm
  - **ID**: publish-all
  - **Tags**: tooling
  - **Details**: Publish in dependency order: `@tasks-md/parser` → `tasks-lint` →
    `tasks-mcp` → `tasks-cli`. All packages have prepublishOnly scripts, README files,
    bin entries (where applicable), and `file:` references already converted to version
    specifiers. Requires `npm adduser` authentication first. Verify name availability
    with `npm view tasks-mcp`, `npm view tasks-lint`, `npm view tasks-cli` before publish.
  - **Blocked by**: remove-bash, fix-mcp-lockfile
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
