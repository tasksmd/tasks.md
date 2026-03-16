# Tasks

## P0

- [ ] Extract shared parser package from duplicated mcp/lint parsers
  - **ID**: shared-parser
  - **Tags**: architecture, DRY
  - **Details**: `mcp/src/parser.ts` (223 lines) and `lint/index.js` (252 lines) both
    parse TASKS.md line-by-line with separate implementations. They share zero code.
    Extract `packages/parser/` with the MCP parser as the canonical implementation.
    Export `Task`, `TaskMetadata`, `TaskFile`, `parseTasksContent`, `discoverTaskFiles`,
    `getAllTaskIds`, `isBlocked`. Both MCP server and linter import from here.
  - **Files**: `mcp/src/parser.ts`, `lint/index.js`, new `packages/parser/`

- [ ] Add root package.json with npm workspaces
  - **ID**: workspaces
  - **Tags**: architecture, build
  - **Details**: No root-level coordination exists. Each sub-package (`mcp/`, `lint/`,
    `scripts/`) is independent with separate build/test. Add a root `package.json` with
    `workspaces: ["packages/*"]` and scripts for `npm test` (runs all), `npm run build`
    (builds all), `npm run lint` (lints all). Move `mcp/` and `lint/` into `packages/`.
  - **Files**: new root `package.json`, `mcp/` → `packages/mcp/`,
    `lint/` → `packages/lint/`

## P1

- [ ] Rewrite linter in TypeScript consuming shared parser
  - **ID**: typed-lint
  - **Blocked by**: shared-parser, workspaces
  - **Tags**: architecture, lint
  - **Details**: `lint/index.js` is 252 lines of untyped JS with its own parser. Rewrite
    as TypeScript that imports `@tasks-md/parser` and validates parsed structures instead
    of raw text. Duplicate ID check becomes `Set<string>` on parsed IDs. Priority order
    check operates on parsed task priorities. Dangling blocker check uses `getAllTaskIds()`.
    Should shrink to ~80 lines of validation logic + ~30 lines CLI.
  - **Files**: `lint/index.js` → `packages/lint/src/index.ts`

- [ ] Replace bash CLI with Node.js CLI
  - **ID**: node-cli
  - **Blocked by**: shared-parser, workspaces
  - **Tags**: architecture, cli
  - **Details**: `scripts/tasks` is a 305-line bash case statement. The `pick` command
    shells out to `node -e` with inline JS importing from MCP dist (breaks if not built).
    `stats` and `diff` reparse TASKS.md with yet more bash. Replace with a TypeScript CLI
    using `commander` that directly calls `pickTask()`, the lint module, and sync adapters.
    All in `packages/cli/`.
  - **Files**: `scripts/tasks` → `packages/cli/src/index.ts`

- [ ] Publish and promote blog post: "Why your AI agent needs a backlog"
  - **Details**: Draft is at `docs/blog/why-your-ai-agent-needs-a-backlog.md`. Review,
    add to site navigation, and publish. Consider cross-posting to dev.to / HN.

## P2

- [ ] Consolidate sync scripts into adapter pattern
  - **ID**: sync-adapters
  - **Blocked by**: node-cli
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
  - **Blocked by**: shared-parser, workspaces
  - **Tags**: tooling, mcp
  - **Details**: Package is publish-ready: prepublishOnly runs build+test (104 tests),
    bin entry has shebang, test files excluded, README updated. After workspace migration,
    update package name and paths, then `npm publish` from `packages/mcp/`.
  - **Files**: `packages/mcp/`

- [ ] Publish tasks-lint to npm
  - **ID**: publish-lint
  - **Blocked by**: typed-lint
  - **Tags**: tooling, lint
  - **Details**: Package is publish-ready: prepublishOnly runs test (22 tests),
    bin entry has shebang, README updated with --fix docs. After TypeScript rewrite,
    update package name and paths, then `npm publish` from `packages/lint/`.
  - **Files**: `packages/lint/`

- [ ] Set up custom domain tasks.md for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
