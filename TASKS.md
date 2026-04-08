# Tasks

## P1

- [ ] Fix hardcoded version strings in CLI and MCP server
  - **ID**: fix-hardcoded-versions
  - **Tags**: bug, cli, mcp
  - **Details**: Both CLI and MCP server hardcode "0.1.0" while package.json says "0.4.0".
    `packages/cli/src/cli.ts:25` has `.version("0.1.0")` and
    `packages/mcp/src/index.ts:20` has `version: "0.1.0"`.
    Read version dynamically from package.json or use a build-time replacement.
  - **Files**: `packages/cli/src/cli.ts`, `packages/mcp/src/index.ts`
  - **Acceptance**: `tasks --version` shows 0.4.0. MCP server reports 0.4.0.

- [ ] Document unclaim_task tool in MCP README
  - **ID**: doc-unclaim-task
  - **Tags**: docs, mcp
  - **Details**: MCP server implements 6 tools but README only documents 5.
    The `unclaim_task` tool (packages/mcp/src/index.ts:96-123) is missing from
    the Tools table in packages/mcp/README.md.
  - **Files**: `packages/mcp/README.md`
  - **Acceptance**: README Tools table lists all 6 tools with descriptions.

- [ ] Add tests for sync integrations (GitHub, Jira, Linear)
  - **ID**: test-sync-integrations
  - **Tags**: test, cli, sync
  - **Details**: Three sync source files have zero test coverage:
    `packages/cli/src/sync/github.ts` (88 lines),
    `packages/cli/src/sync/jira.ts` (97 lines),
    `packages/cli/src/sync/linear.ts` (115 lines).
    Only `engine.ts` has tests. Need tests for priority mapping,
    tag extraction, error handling, and auth validation.
  - **Files**: `packages/cli/src/sync/github.test.ts`, `packages/cli/src/sync/jira.test.ts`,
    `packages/cli/src/sync/linear.test.ts`
  - **Acceptance**: Each sync source has 15+ tests covering happy path, error cases,
    and priority mapping. `npm test` passes.

## P2

- [ ] Add policy validation to linter
  - **ID**: lint-policy-validation
  - **Tags**: lint, parser, feature
  - **Details**: Spec defines policies (spec.md lines 81-145) but the linter
    doesn't validate them. Parser extracts policies correctly but linter
    never checks format or scope. Add validation for:
    (1) policies are in HTML comments, (2) `policy:` prefix format,
    (3) file-level vs section-level placement is correct.
  - **Files**: `packages/lint/src/lint.ts`, `packages/lint/src/lint.test.ts`
  - **Acceptance**: Linter warns on malformed policies. Tests cover file-level
    and section-level scope. `npm test` passes.

- [ ] Remove unused getRelativePath export from MCP parser
  - **ID**: remove-dead-code-mcp
  - **Tags**: cleanup, mcp
  - **Details**: `getRelativePath` exported from `packages/mcp/src/parser.ts:16-18`
    but never imported anywhere.
  - **Files**: `packages/mcp/src/parser.ts`
  - **Acceptance**: Export removed. `npm test` passes. No imports break.

- [ ] Fix stale precise counters in docs — use N+ approximations for volatile counts
  **ID**: fix-stale-counters
  **Details**: Scan README.md, AGENTS.md, and code comments for precise counts of things that change frequently (tests, lint rules, packages). Replace with `N+` approximations. Keep precise counts only for user-facing features under 11 items.
  **Acceptance**: No precise counts for volatile metrics in docs. `npm test` passes.

## P3

- [ ] Set up publish workflow for GitHub Actions
  - **ID**: publish-action
  - **Tags**: tooling
  - **Details**: The `@tasks-md/lint` GitHub Action at `.github/actions/lint/` is ready.
    Verify the action works in a test repo.
  - **Acceptance**: `uses: tasksmd/tasks.md/.github/actions/lint@main` works in external repos

- [ ] Set up custom domain for GitHub Pages
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.

- [ ] Expand sync documentation with examples
  - **ID**: doc-sync-examples
  - **Tags**: docs, cli, sync
  - **Details**: CLI README documents sync commands but doesn't explain priority
    mapping (GitHub labels to P0-P3), tag extraction from issue trackers,
    merge behavior on repeated syncs, or ID prefix usage.
  - **Files**: `packages/cli/README.md`
  - **Acceptance**: Sync section has examples for GitHub, Jira, and Linear
    showing priority mapping and tag extraction.
