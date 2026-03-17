# Tasks

## P1

- [ ] Consolidate file discovery into @tasks-md/parser
  - **ID**: consolidate-discovery
  - **Tags**: parser, refactor
  - **Details**: `findGitRoot`, `discoverTaskFiles`, and `loadAllTasks` are duplicated
    in `packages/mcp/src/parser.ts` (async) and `packages/cli/src/lib.ts` (sync). Move
    a single canonical implementation into `@tasks-md/parser` with both sync and async
    variants. Then simplify both mcp and cli to import from parser instead of maintaining
    their own copies. This is the foundation — both packages share one discovery engine.
  - **Files**: `packages/parser/src/index.ts`, `packages/mcp/src/parser.ts`, `packages/cli/src/lib.ts`
  - **Acceptance**: Single discovery implementation in parser, mcp and cli import it,
    all tests pass, no duplicate `findGitRoot` or `discoverTaskFiles` functions remain

- [ ] Rewrite init command in TypeScript
  - **ID**: ts-init
  - **Tags**: cli, refactor
  - **Details**: `tasks init` currently delegates to `scripts/init.sh` via execFileSync.
    Rewrite as native TypeScript in `packages/cli/src/commands/init.ts`. Behavior: create
    TASKS.md with P1/P2 sections, append Task Management section to AGENTS.md if present,
    optionally run install with --install flag. Port the exact same logic — don't change behavior.
  - **Files**: `packages/cli/src/commands/init.ts`, `scripts/init.sh`
  - **Blocked by**: consolidate-discovery
  - **Acceptance**: `npx tasks-cli init` works identically to `bash scripts/init.sh`, tests added

- [ ] Rewrite install command in TypeScript
  - **ID**: ts-install
  - **Tags**: cli, refactor
  - **Details**: `tasks install` currently delegates to `scripts/install.sh`. Rewrite in
    TypeScript. Detect agent directories (.claude/, .cursor/, .windsurf/, .gemini/, .agents/),
    copy command files, support --all and --hooks flags. The --hooks flag installs a
    pre-commit hook that runs tasks-lint on staged TASKS.md files.
  - **Files**: `packages/cli/src/commands/install.ts`, `scripts/install.sh`
  - **Blocked by**: consolidate-discovery
  - **Acceptance**: `npx tasks-cli install` works identically, tests added

- [ ] Rewrite generate-commands in TypeScript
  - **ID**: ts-generate-commands
  - **Tags**: cli, refactor
  - **Details**: `tasks generate-commands` delegates to `scripts/generate-commands.sh`.
    Rewrite in TypeScript. Read `commands/next-task.md` (canonical), produce agent-specific
    files for Claude Code, Codex, Cursor, Gemini CLI, and Windsurf with correct frontmatter
    and {{AGENT_EXAMPLE}} substitution. This makes the command work as a published npm package.
  - **Files**: `packages/cli/src/commands/generate-commands.ts`, `scripts/generate-commands.sh`
  - **Acceptance**: Output matches current bash-generated files exactly, drift CI check passes

- [ ] Rewrite watch command in TypeScript
  - **ID**: ts-watch
  - **Tags**: cli, refactor
  - **Details**: `tasks watch` delegates to `scripts/watch.sh` which requires fswatch
    (macOS) or inotifywait (Linux). Rewrite using `node:fs.watch` so it works cross-platform
    with zero external dependencies. Watch all discovered TASKS.md files, auto-lint on change,
    show colored output.
  - **Files**: `packages/cli/src/commands/watch.ts`, `scripts/watch.sh`
  - **Blocked by**: consolidate-discovery
  - **Acceptance**: `npx tasks-cli watch` works on macOS and Linux without fswatch/inotifywait

## P2

- [ ] Remove bash scripts and legacy CLI
  - **ID**: remove-bash
  - **Tags**: cleanup
  - **Details**: Once all commands are TypeScript-native, delete: `scripts/tasks` (legacy
    bash CLI), `scripts/init.sh`, `scripts/install.sh`, `scripts/watch.sh`,
    `scripts/generate-commands.sh`, `scripts/validate-examples.sh` (duplicates tasks-lint),
    `scripts/sync-issues.sh`, `scripts/sync-jira.sh`, `scripts/sync-linear.sh` (replaced
    by TypeScript adapters). Remove `SCRIPTS_DIR` constant and `delegateToScript` function
    from `packages/cli/src/cli.ts`. Keep only `scripts/build-site.js` (repo-internal).
  - **Blocked by**: ts-init, ts-install, ts-generate-commands, ts-watch
  - **Acceptance**: `scripts/` contains only `build-site.js`, CLI has no execFileSync to bash

- [ ] Update CI commands-drift job for TypeScript generate-commands
  - **ID**: fix-ci-drift
  - **Tags**: ci
  - **Details**: The commands-drift CI job still runs `bash scripts/generate-commands.sh`.
    After ts-generate-commands is done, update to use the TypeScript CLI instead. The lint
    job and validate job have already been fixed (validate removed, lint uses dist/cli.js).
  - **Files**: `.github/workflows/ci.yml`
  - **Blocked by**: ts-generate-commands
  - **Acceptance**: commands-drift job uses TypeScript CLI, no bash script references remain

- [ ] Fix docs ghost references to deleted sync scripts
  - **ID**: fix-docs-sync
  - **Tags**: docs
  - **Details**: `docs/user-stories/06-issue-tracker-flows-to-agents.md` lines 153-155
    reference `scripts/sync-issues.sh`, `scripts/sync-jira.sh`, `scripts/sync-linear.sh`
    in its Files table. These were replaced by TypeScript adapters in
    `packages/cli/src/sync/`. Update the table to reference the new file paths.
  - **Files**: `docs/user-stories/06-issue-tracker-flows-to-agents.md`
  - **Acceptance**: No docs reference deleted script paths

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
