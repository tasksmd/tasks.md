# Tasks

## P0

## P1

## P2

- [ ] Fix enrich_task missing Acceptance insertion (@devin-session-32)
  - **ID**: fix-enrich-task-missing-acceptance
  - **Tags**: mcp, bug, tests
  - **Details**: `enrichTask` creates `  - **Acceptance**:` with no inline
    value when `add_acceptance` is provided for a task that lacks Acceptance.
    The parser requires a non-empty metadata value, so the added continuation
    lines are not captured as `metadata.acceptance`.
  - **Files**: `packages/mcp/src/tools.ts`,
    `packages/mcp/src/tools.test.ts`
  - **Acceptance**: Add a regression test that enriches a task without
    Acceptance, re-parses the updated file, and sees the new acceptance text.
    Fix the formatter so the generated TASKS.md block is parser-readable.

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Blocked**: needs-user-approval — buying or configuring a public
    domain/DNS and GitHub Pages custom domain is an external public action that
    requires explicit current-session operator approval.
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
  - **Research**: 2026-05-02 — custom-domain setup notes
    Repo has no `CNAME` file. The current published URL appears in `README.md`
    as `https://tasksmd.github.io/tasks.md/`, and `scripts/build-site.js`
    generates `docs/index.html` from `docs/template.html`, `spec.md`, and
    `commands/`. Once domain ownership/configuration is approved, expect to add
    the GitHub Pages `CNAME` file or Pages setting, update the README website
    link, and rebuild `docs/index.html` if the rendered site needs the new URL.
    Approval needed before any domain purchase, DNS change, Pages custom-domain
    setting, or remote GitHub write.
  - **Files**: `README.md`, `scripts/build-site.js`, `docs/index.html`
  - **Last-enriched**: 2026-05-02
