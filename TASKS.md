# Tasks

## P1

- [ ] Fix GitHub sync mapPriority — low/p3 labels ignored due to promote-only logic
  - **ID**: fix-github-priority-demotion
  - **Tags**: bug, cli, sync
  - **Details**: `mapPriority` in `packages/cli/src/sync/github.ts` starts at P2 (default)
    and only picks priority labels with lower numbers (`mapped < priority`). This means
    "low" (3) and "p3" (3) labels are silently ignored — issues with only a "low" label
    get P2 instead of P3. Change the condition to also allow demotion.
  - **Files**: `packages/cli/src/sync/github.ts`, `packages/cli/src/sync/github.test.ts`
  - **Acceptance**: Issues with only "low" or "p3" label map to P3. Existing priority
    promotion still works (multiple labels → pick highest). Tests updated.

## P2

- [ ] Fix stale precise counters in docs — use N+ approximations for volatile counts
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
