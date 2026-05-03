# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

## P1

## P2

- [ ] Polish batch — story 02 backtick fix + story 07 pick docs + story 03 pick-vs-next-task
  - **ID**: user-stories-polish-batch
  - **Tags**: docs, user-stories, polish, batched
  - **Details**: Three small but verified findings, batched per Rule 9:
    (1) **Story 02 line ~95** — Files field example uses double
    backticks (`` ``src/auth.ts`` ``) where `spec.md:194` and the
    spec definition (`spec.md:225`) use single backticks. Fix to
    single backticks.
    (2) **Story 07** — README claims `tasks pick` is documented in
    story 07 (see `docs/user-stories/README.md:27`) but story 07
    never mentions the command. Add a "Pick the next task" section
    to `07-monitor-queue-health.md` that documents: shape of the
    output, `--tags` filter, exit code 0 on hit / non-zero on
    empty queue, intended use ("read-only check the agent will run
    next, useful for human inspection or scripting").
    (3) **Story 03** — does not distinguish `/next-task` (the full
    autonomous loop in `commands/next-task.md`) from `tasks pick`
    (the read-only query). Add a "How `tasks pick` relates" note
    after the "What it does" section: "`tasks pick` is the
    read-only inspection — same algorithm, no claim, no commit.
    `/next-task` is `tasks pick` plus claim, plan, implement,
    commit, loop."
  - **Files**: `docs/user-stories/02-tasks-agents-complete-without-asking.md`,
    `docs/user-stories/07-monitor-queue-health.md`,
    `docs/user-stories/03-agents-work-through-queue.md`
  - **Acceptance**: All three findings fixed in one PR. `npm run
    lint`, `npm run build`, and `npx -y @tasks-md/lint TASKS.md` pass.
  - **Last-enriched**: 2026-05-03

- [ ] Add mid-session main sync (or per-session sync) option to taskgrind
  - **ID**: taskgrind-per-session-sync
  - **Tags**: taskgrind, sync, queue, duplicate-work, cross-repo
  - **Blocked**: needs-user-approval — the deliverable is a code
    change in `/Users/fivanishche/apps/taskgrind` (`bin/taskgrind`,
    `tests/git-sync.bats`, `README.md`, `man/taskgrind.1`), and
    landing it requires pushing a feature branch to that remote and
    opening an upstream PR — a cross-repo public write outside the
    current `tasks.md` workspace that requires explicit
    current-session operator approval. Additionally, the taskgrind
    repo is being actively modified right now: 8 files dirty on
    `main` including `bin/taskgrind`, `tests/features.bats`,
    `tests/signals.bats`, `README.md`, `man/taskgrind.1`,
    `docs/architecture.md`, `docs/user-stories.md`, and `TASKS.md`,
    with a `bats tests/signals.bats` run in flight (PID 38645+) and
    `.taskgrind-state` reporting `status=running session=4`. Two of
    the three target files (`bin/taskgrind`, `README.md`) overlap
    with the concurrent agent's WIP — picking this up from a
    `tasks.md` session would race their edits. The previous
    `**Blocked**` line on this task was unintentionally removed by
    the squash-merge of #45 (which re-included session 4's pre-block
    snapshot of TASKS.md); restoring it here.
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
    `lib/constants.sh`, `tests/git-sync.bats`, `README.md`,
    `man/taskgrind.1`
  - **Acceptance**: Default sync interval is 1 OR a "concurrent
    operator" mode is available that forces `git fetch && rebase`
    between every session. Documented behavior change. Test added.
  - **Research**: 2026-05-02 — implementation sketch
    Sync behavior in taskgrind currently lives in three call sites:
    1. `lib/constants.sh:35` defines `DVB_DEFAULT_SYNC_INTERVAL="5"`.
    2. `bin/taskgrind:673` reads
       `sync_interval="${DVB_SYNC_INTERVAL:-$DVB_DEFAULT_SYNC_INTERVAL}"`
       (the `TG_*` → `DVB_*` translation table around line 231 maps
       `TG_SYNC_INTERVAL` to `DVB_SYNC_INTERVAL`).
    3. The sync gate at `bin/taskgrind:5413` triggers when
       `sync_interval == 0` OR `session % sync_interval == 0`, with
       a `_dvb_slot >= 1` early-return so only slot 0 syncs and a
       `git_sync skipped (interval=…, session=…)` log line at
       `bin/taskgrind:5586` for the non-trigger path.
    Help/doc surfaces that mention the default: `bin/taskgrind:94`
    (header help block), `README.md:248` (env-var table row), and
    `man/taskgrind.1` (the same env-var entry — concurrent agent is
    rewriting this file as part of the `TG_STALL_EXIT` consolidation).
    Smallest-change option (acceptance "default sync interval is 1"):
    flip `DVB_DEFAULT_SYNC_INTERVAL` from `"5"` to `"1"`, then update
    the three doc surfaces above. Existing tests in
    `tests/git-sync.bats` already parameterize
    `DVB_SYNC_INTERVAL=0|2|3` (lines 42-131), so a new bats case can
    drop the `DVB_SYNC_INTERVAL` export entirely and assert that
    every loop iteration logs `git_sync` (not `git_sync skipped`).
    Divergence-detection option (acceptance "concurrent-operator
    mode that forces sync"): keep the default at 5 but add a cheap
    probe before the interval gate at line 5413 — `git fetch
    --quiet origin "$_default_branch"` followed by `git rev-list
    HEAD..origin/$_default_branch --count`. If the count is non-zero,
    log `git_sync forced reason=diverged ahead=N` and run the
    existing stash/checkout/fetch/rebase block; otherwise fall
    through to the interval logic. Bats coverage stages a remote one
    commit ahead and asserts `git_sync forced` appears even with
    `DVB_SYNC_INTERVAL=99`. Either option must keep the
    `_dvb_slot >= 1` early-return so only slot 0 syncs.
    Concurrent-agent note: the live README diff in taskgrind is the
    `TG_STALL_EXIT` consolidation (collapsing `TG_NO_STALL_EXIT`,
    `TG_EXIT_ON_STALL`, and `TG_EARLY_EXIT_ON_STALL` into a single
    `TG_STALL_EXIT={never|first|second}` knob) — it rewrites the
    same env-var table neighborhood as the `TG_SYNC_INTERVAL` row,
    so this work should land after that branch merges (or be
    rebased onto it) to avoid a textual conflict. The taskgrind
    state file `.taskgrind-state` showed `status=running session=4`
    during this enrichment, so the operator should also wait for
    that grind to finish (or pause it) before unblocking.
  - **Last-enriched**: 2026-05-02

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

