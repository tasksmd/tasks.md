# Tasks

## P0

## P1

## P2

- [ ] Add a "trusted repo" mode to taskgrind that allows push and PR by default
  - **ID**: taskgrind-trusted-repo-mode
  - **Tags**: taskgrind, ergonomics, public-write, queue
  - **Details**: During the 2026-05-02 10h tech-lead taskgrind on
    `tasks.md`, every session ended with the agent committing locally
    and stopping at the public-write gate. The operator (me) had to
    manually push 10+ branches, create 9+ PRs, and merge them. The
    user has already authorized "full approval for personal/side
    project repos" and would prefer the agent push and PR by default
    when the remote is one they own. Add a config-driven trusted-repo
    mode (e.g. `TG_TRUSTED_REPO=1` or detect from a list of allowed
    remotes) that flips the agent prompt from "Approval needed —
    draft body at <path>" to "push the feature branch and open the
    PR; do not merge to protected branches". Keep merge-to-main
    requiring explicit approval. Filed in this repo because the
    behavior interacts with the canonical taskgrind prompt template
    in `taskgrind/prompt-template.md`; the upstream binary work would
    land in `/Users/fivanishche/apps/taskgrind`.
  - **Files** (in taskgrind repo): `bin/taskgrind`,
    `taskgrind/prompt-template.md` (canonical mirror in this repo),
    `tests/preflight.bats`, `README.md`, `man/taskgrind.1`
  - **Acceptance**: With `TG_TRUSTED_REPO=1` set, the agent can
    `git push` feature branches and open PRs via `gh pr create`
    without explicit per-session approval. Merging to `main` /
    protected branches still requires approval. A bats test verifies
    the prompt change. Documented in README env-var table.

- [ ] Add mid-session main sync (or per-session sync) option to taskgrind
  - **ID**: taskgrind-per-session-sync
  - **Tags**: taskgrind, sync, queue, duplicate-work
  - **Details**: With `TG_SYNC_INTERVAL=5` (default), sessions 1-4
    work off the same stale `main`. During the 2026-05-02 tech-lead
    run, the operator merged session 1's PRs (which removed 5 task
    blocks) but session 2 still saw the old TASKS.md and re-claimed
    one of the just-completed tasks (`reconcile-session-28-30-followups`),
    redoing the cherry-picks and conflicts on a fresh branch. Add an
    option `TG_SYNC_INTERVAL=1` (or change the default) and document
    the trade-off — frequent syncs add fetch overhead but prevent
    duplicate-work episodes when an external operator is merging
    PRs in parallel. Better: detect when local main has diverged
    from origin/main between sessions and force a sync regardless of
    interval.
  - **Files** (in taskgrind repo): `bin/taskgrind`,
    `tests/git-sync.bats`, `README.md`
  - **Acceptance**: Default sync interval is 1 OR a "concurrent
    operator" mode is available that forces `git fetch && rebase`
    between every session. Documented behavior change. Test added.

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

