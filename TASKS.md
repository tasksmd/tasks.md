# Tasks

## P0

## P1

## P2

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

- [ ] Delete superseded remote branches on origin
  - **ID**: cleanup-stale-remote-branches
  - **Tags**: hygiene, git, public-write
  - **Blocked**: needs-user-approval — `git push origin --delete <branch>`
    is a public-write action against the public remote and requires
    explicit current-session operator approval. Local cleanup already
    landed (six redundant branches deleted in this session — see
    git reflog and the predecessor `cleanup-stale-local-branches` task
    on commit history).
  - **Details**: After the local cleanup pass, these origin branches
    still hold superseded work and should be deleted:
    `origin/chore/reconcile-session-28-30-followups-2026-05-02` —
    superseded by PR #40 (`cac6732`).
    `origin/task/session-31-next-task-target-task-id` — superseded by
    PR #33 (`b8310be`).
    `origin/fix/mcp-exact-id-mutations-session-29` — content delivered
    via PR #40 squash merge.
    `origin/fix/skip-standing-loop-picks-session-28` — content
    delivered via PR #40 squash merge (the `ff35069` fix).
    `origin/task/next-task-target-task-id` — content delivered via
    PR #41 (`0aaf413`) and PR #33.
    `origin/docs/next-task-target-id-session-11` — older targeted-ID
    attempt; superseded by PR #33.
    `origin/feat/next-task-target-task-id` — earlier targeted-ID
    attempt (4 commits); superseded by PR #33.
    `origin/docs/agent-guide-baseline-task-20260430` — agent guide
    baseline refresh; content subsumed by `aa963c4` on main.
    `origin/chore/audit-tasks-2026-04-24` — predates PR #30 and would
    delete the entire `taskgrind/` directory if merged; **delete
    only**, never merge.
    The local branch `feat/queue-pressure-deliver-vs-add` is checked
    out in `/Users/fivanishche/apps/tasks.md-stop-check`; the operator
    needs to retire that worktree (or detach HEAD) before the local
    branch can be deleted as a follow-up.
  - **Files**: n/a (git operations only)
  - **Acceptance**: All nine listed origin branches are deleted via
    `git push origin --delete <branch>`. After `git fetch --prune`,
    `git branch -r` shows only `origin/main` plus any actively-developed
    feature branches.


