# Tasks

## P2

- [ ] Publish tasks-mcp to npm
  - **ID**: publish-mcp
  - **Tags**: tooling, mcp
  - **Details**: Package is publish-ready: prepublishOnly runs build+test (104 tests),
    bin entry has shebang, test files excluded, README updated. After workspace migration,
    update package name and paths, then `npm publish` from `packages/mcp/`.
  - **Files**: `packages/mcp/`

- [ ] Publish tasks-lint to npm
  - **ID**: publish-lint
  - **Tags**: tooling, lint
  - **Details**: Package is publish-ready: prepublishOnly runs test (22 tests),
    bin entry has shebang, README updated with --fix docs. After TypeScript rewrite,
    update package name and paths, then `npm publish` from `packages/lint/`.
  - **Files**: `packages/lint/`

- [ ] Publish tasks-cli to npm
  - **ID**: publish-cli
  - **Tags**: tooling, cli
  - **Details**: New TypeScript CLI (`packages/cli/`) replaces the old bash script.
    Publish as `tasks-cli` so users can `npx tasks-cli init`, `npx tasks-cli pick`, etc.
    Ensure bin entry, prepublishOnly, and README are ready.
  - **Files**: `packages/cli/`

- [ ] Update README.md lint/tooling references
  - **Tags**: docs
  - **Details**: README still references `node packages/lint/index.js` in the Linter
    section. Update to `npx tasks-lint` / `tasks lint`. Also update MCP server setup
    example if paths changed.
  - **Files**: `README.md`

- [ ] Set up custom domain tasks.md for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
