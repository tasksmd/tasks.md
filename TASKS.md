# Tasks

## P0

## P1

## P2

- [ ] Stop hardcoding command frontmatter descriptions in `generate-commands.ts`
  - **ID**: generate-commands-frontmatter-source
  - **Tags**: cli, drift, tooling
  - **Details**: `packages/cli/src/commands/generate-commands.ts` keeps
    five hardcoded `description` strings (one per agent variant plus the
    gemini TOML). Whenever someone updates a variant SKILL.md or the
    canonical `commands/next-task.md`, the generator's strings drift
    from reality and the `commands-drift` CI job rejects the next
    regeneration. This was the immediate blocker on PR #33 (fixed by
    1126a89, but the underlying class of bug remains). Make the
    generator either (a) read the canonical description from
    `commands/next-task.md` once and reuse it for every agent, or (b)
    regenerate the canonical when the constants change. One source of
    truth, one place to edit.
  - **Files**: `packages/cli/src/commands/generate-commands.ts`,
    `packages/cli/src/commands/generate-commands.test.ts`,
    `commands/next-task.md`
  - **Acceptance**: Generator no longer carries duplicated description
    strings. Updating the canonical alone (or a single shared constant)
    is enough to keep all six variants in sync. CI's `commands-drift`
    job stays green after a description tweak without manually touching
    the generator.

- [ ] Reconcile session 28-30 follow-up commits onto main
  - **ID**: reconcile-session-28-30-followups
  - **Tags**: lint, mcp, parser, delivery
  - **Details**: Branch `fix/mcp-exact-id-mutations-session-29` (now pushed
    to origin) holds four shipped-but-unmerged fixes from the 2026-05-01
    taskgrind run (sessions 28-30). After PR #33 merges, cherry-pick or
    re-apply these onto main since they are not on the current PR #33 head:
    `5e22e03` fix(lint): discover nested TASKS.md files when a directory is
    passed to `tasks-lint`. `6d5d8af` fix(lint): re-validate `--fix` output
    so removed completed-task metadata no longer reports orphaned-metadata
    errors. `09d8c8a` fix(mcp): prefer exact `**ID**:` matches over fuzzy
    summary contains for mutation tools so operations target the right task
    when summaries overlap. `ff35069` fix(parser): skip tasks tagged
    `standing-loop` in `pickBestTask` auto-pick.
  - **Files**: `packages/lint/src/lint.ts`, `packages/lint/src/lint.test.ts`,
    `packages/mcp/src/tools.ts`, `packages/mcp/src/tools.test.ts`,
    `packages/mcp/src/index.ts`, `packages/parser/src/index.ts`,
    `packages/parser/src/index.test.ts`
  - **Acceptance**: Each cherry-picked commit lands on `main` via a PR
    with passing `npm run build`, `npm test`, `npm run lint`,
    `npx -y @tasks-md/lint TASKS.md`. Branch
    `fix/mcp-exact-id-mutations-session-29` is deleted after delivery.

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

- [ ] Investigate root cause of npm-install version artifact files
  - **ID**: investigate-npm-version-artifacts
  - **Tags**: hygiene, npm
  - **Details**: The tasks.md worktree contains three untracked files
    that look like accidental npm output: `=1.11.0`, `=2.32.4`,
    `=5.5.0`. These appear to come from running `npm install
    package@>=X` without quoting the version specifier, so the shell
    redirected output to files literally named `=X.Y.Z`. Identify which
    npm command produced them, document the trap in `AGENTS.md` if
    appropriate, and remove the files.
  - **Files**: `=1.11.0`, `=2.32.4`, `=5.5.0` (to delete), optionally
    `AGENTS.md` (to add a note)
  - **Acceptance**: The three files are removed from the worktree, the
    root-cause command is identified (e.g., from shell history), and
    either `.gitignore` or `AGENTS.md` is updated if there's a
    recurring pattern worth documenting.
