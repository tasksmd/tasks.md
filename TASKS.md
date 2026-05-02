# Tasks

## P0

## P1

## P2

- [ ] Re-export targeted-ID parser API from `@tasks-md/parser`
  - **ID**: parser-api-target-id-exports
  - **Tags**: parser, api, mcp, refactor
  - **Details**: The earlier PR #33 head (preserved on the session-11
    and feat/next-task branches; see `git branch -a | grep
    next-task-target`) exported `findTasksById` and `normalizeTaskId`
    from `packages/parser/src/index.ts`, and re-exported `findTasksById`
    from `packages/mcp/src/parser.ts`. The current PR #33 implements an
    equivalent private `findTasksByExactId` helper inline in
    `packages/mcp/src/tools.ts`. Move the helper into the parser package
    so `@tasks-md/parser` consumers (CLI, MCP, and external integrations)
    can target tasks by exact ID without duplicating the normalization
    rule (trim plus strip surrounding backticks).
  - **Files**: `packages/parser/src/index.ts`,
    `packages/parser/src/index.test.ts`,
    `packages/mcp/src/parser.ts`, `packages/mcp/src/tools.ts`,
    `packages/mcp/src/tools.test.ts`
  - **Acceptance**: `findTasksById` and `normalizeTaskId` are exported
    from `@tasks-md/parser`. `packages/mcp/src/tools.ts` uses the parser
    export instead of an inline helper. `packages/mcp/src/parser.ts`
    re-exports `findTasksById` for MCP-side imports. All existing tests
    pass; new parser tests cover the exact-ID lookup and normalization
    behavior.

- [ ] File Bosun follow-up: deliver orphan `main` commit `924f8f14`
  - **ID**: bosun-orphan-main-commit-924f8f14
  - **Tags**: bosun, delivery, cross-repo
  - **Blocked**: needs-user-approval — this task lives in a different
    repo (`/Users/fivanishche/apps/bosun`) and would require pushing a
    feature branch to that remote and opening a Bosun PR. Cross-repo
    publication outside the current `tasks.md` workspace requires
    explicit current-session operator approval. Another agent is also
    actively working in Bosun, so the operator should coordinate the
    handoff before unblocking.
  - **Details**: `/Users/fivanishche/apps/bosun` local `main` is one
    commit ahead of `origin/main` with `924f8f14 refactor(skills): apply
    3 improvement themes to user persona AIFN-720` (authored
    2026-05-02 12:33). Direct commits on `main` violate the Bosun policy
    `<!-- policy: Never commit directly on main — create a feature branch
    first. -->` from `bosun/TASKS.md`. The proper delivery path is to
    move the commit to a feature branch and open a PR. Another agent is
    actively working in Bosun (saw branch flips and staged `bin/bosun`
    changes during this taskgrind run), so coordinate before rewriting
    local `main`.
  - **Files** (in bosun repo):
    `skill-plugins/orchestrator/orchestrator-user/SKILL.md`
  - **Acceptance**: Either (a) commit is delivered via a Bosun PR with
    `AIFN-720` suffix and bosun's `cd orchestrator && npm run verify`
    passes, or (b) the commit is reverted on local main if it duplicates
    work already on origin/main.
  - **Last-enriched**: 2026-05-02

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

- [ ] Clean up stale local branches in tasks.md worktree
  - **ID**: cleanup-stale-local-branches
  - **Tags**: hygiene, git
  - **Details**: Several local branches contain superseded work and can
    be deleted after the PR #33 merge. Audit each before deleting:
    `chore/audit-tasks-2026-04-24` predates PR #30 (the taskgrind/
    extraction); its diff would delete the entire `taskgrind/` directory
    so do not push or merge — delete instead.
    `feat/queue-pressure-deliver-vs-add` content was already merged via
    squash PR #31 (`989bc29`); local commit `11c7630` is now redundant.
    `pr-33-next-task-target-id` is identical to PR #33's branch (the
    session-21 `docs/...` ref); redundant.
    `feat/next-task-target-task-id` was an earlier targeted-ID attempt
    (4 commits) superseded by PR #33's content. The session-11
    `docs/...` branch holds the older 15+ commit attempt; also
    superseded by PR #33's content. After PR #33 merges: also delete
    `task/session-31-next-task-target-task-id`, the rebased-onto-PR-#33
    branch.
  - **Files**: n/a (git operations only)
  - **Acceptance**: Each branch listed is either kept (if unique work
    was re-delivered) or deleted locally and on `origin`. `git branch
    --no-merged main` returns only branches with active or planned
    work.


