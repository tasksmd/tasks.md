# Tasks

## P1

- [ ] Publish and promote blog post: "Why your AI agent needs a backlog"
  - **Details**: Draft is at `docs/blog/why-your-ai-agent-needs-a-backlog.md`. Review,
    add to site navigation, and publish. Consider cross-posting to dev.to / HN.

## P2

- [ ] Consolidate sync scripts into adapter pattern
  - **ID**: sync-adapters
  - **Tags**: architecture, DRY
  - **Details**: `sync-issues.sh` (290 lines), `sync-jira.sh` (315 lines), and
    `sync-linear.sh` (340 lines) all follow the same pattern: auth → fetch → map priority
    → map labels to tags → generate markdown → merge. Each reimplements priority mapping,
    markdown generation, and merge mode independently. Define a `SyncSource` interface with
    `fetchIssues()`, `mapPriority()`, `mapTags()`. Each source is a thin adapter. Shared
    sync engine handles markdown generation and merge. Adding Asana/Notion = one file.
  - **Files**: `scripts/sync-*.sh` → `packages/cli/src/sync/`

- [ ] Auto-generate website from spec.md
  - **ID**: site-gen
  - **Tags**: docs, build
  - **Details**: `docs/index.html` (20KB) hand-duplicates content from `spec.md` and
    `README.md`. Updating the spec requires editing two files. Add a build step that
    generates the site from markdown sources. Could be as simple as marked + a template,
    or a static site generator. The key requirement is that spec changes auto-update the site.
  - **Files**: `docs/index.html`, `spec.md`, `README.md`

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
