# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

## P1

- [ ] Workspace mode: parser, CLI, MCP, and `/next-task` aggregate TASKS.md files across nested repos in a workspace folder
  - **ID**: workspace-mode-nested-repos
  - **Tags**: spec, parser, cli, mcp, next-task, workspace, multi-repo
  - **Details**: Operators with a workspace folder containing multiple repos (`~/apps/tooling/` with 10+ repos as of 2026-05-12, each with its own `TASKS.md`) currently have no first-class way to pick the highest-priority unblocked task across the whole workspace. `/next-task` reads `./TASKS.md` only. To work the workspace, the operator `cd`s into each repo individually, runs the command, picks something, finishes, repeats. Friction scales with repo count.

    The right answer is a workspace mode in the canonical tasks.md tooling, since the spec + parser + MCP + CLI are the load-bearing dependencies every other tool (agentbrew, dotfiles, minsky-observer, taskgrind) consumes.

    **Outcome-shaped** (what a workspace-aware operator sees):

    1. Operator runs `tasks --workspace ~/apps/tooling next` (or `/next-task` from any cwd inside a workspace-marked folder).
    2. The tool discovers every `TASKS.md` under the workspace root (excluding `.worktrees/**`, `node_modules/**`, etc.), parses each, and produces a unified queue ordered by `(priority, repo, document-order)`.
    3. P0 in repo A beats P1 in repo B (priority dominates).
    4. Output names the repo + task ID + title. Claiming the task and editing TASKS.md happens inside the corresponding repo's checkout.
    5. Cross-repo `**Blocked by**:` references (e.g. `**Blocked by**: agentbrew#agentfile-command-sources`) are recognised and resolved.

    **Spec extension** (`spec.md`):

    - New § "Workspace folders": a workspace is any directory marked by `.tasks-md-workspace` (sentinel file, similar to `.git`) OR a directory containing ≥ 2 immediate child dirs each carrying a `TASKS.md`. The sentinel takes precedence and may declare repo discovery globs explicitly.
    - Cross-repo blocker reference: `**Blocked by**: <repo-name>#<task-id>` (the `<repo-name>` is the dir name under the workspace root). The single-repo form (`**Blocked by**: <task-id>`) stays valid for backwards compatibility.
    - `.tasks-md-workspace` schema (YAML): `{repos: ["minsky", "agentbrew", "dotfiles"], exclude: ["dotfiles-intuit.bundle"], priorityWeights: {minsky: 1.0, agentbrew: 0.8}}` — `priorityWeights` is optional per-repo modifier when two repos' priorities legitimately differ in user importance.

    **Implementation surfaces**:

    - `@tasks-md/parser`: new `parseWorkspace(workspaceRoot)` returning `{repo, file, tasks}[]`. The existing `parse()` stays single-file. Discovery honours `.gitignore` + `.tasks-md-ignore` (new optional file).
    - `tasks` CLI: `--workspace=<path>` flag on `tasks next`, `tasks lint`, `tasks list`. Default behaviour unchanged.
    - `tasks-mcp` (MCP server): new tool `find_next_task_in_workspace({workspace})` returning the chosen `{repo, task_id, file_path}`. The existing `find_next_task` stays single-repo.
    - `commands/next-task.md` canonical source: a new step `0. Workspace detection` — if `$(pwd)` is inside a workspace AND the operator didn't pass an explicit repo flag, surface a one-line prompt "Workspace detected (N repos, M tasks total) — pick across the workspace? [Y/n]" before falling through to single-repo. All 6 generated agent variants regenerate via `npx tasks generate-commands`.

    Cross-repo dependencies on this feature: agentbrew gains a workspace-aware `agentbrew sync` (filed as a companion task in that repo); dotfiles gains a `dotfiles-doctor` check (filed as a companion task there).
  - **Files**: `spec.md`, `examples/workspace.md` (new — example workspace), `packages/parser/src/workspace.ts` (new), `packages/parser/src/workspace.test.ts` (new, paired), `packages/cli/src/commands/next.ts` (extend with workspace flag), `packages/cli/src/commands/lint.ts` (extend), `packages/cli/src/commands/list.ts` (extend), `packages/mcp/src/tools/findNextTaskInWorkspace.ts` (new), `packages/mcp/src/tools/findNextTaskInWorkspace.test.ts` (new), `commands/next-task.md` (canonical workspace step), `commands/lint-tasks.md` (workspace flag), `README.md` (workspace quickstart), all 6 generated agent variants under `commands/<agent>/` (regenerated via `npx tasks generate-commands`).
  - **Acceptance**: (a) `tasks --workspace ~/apps/tooling next` exits 0 + prints `<repo>:<task-id>` for the highest-priority unblocked task across the workspace; (b) `parseWorkspace()` discovers all `TASKS.md` files except those in `.worktrees/**` / `node_modules/**`; (c) cross-repo `**Blocked by**: <repo>#<task-id>` is recognised + resolved; (d) the `tasks-mcp` server exposes `find_next_task_in_workspace`; (e) `commands/next-task.md` step list regenerated; (f) `npm run build && npm test` pass; (g) `npx tasks generate-commands` is clean (commands-drift CI gate).
  - **Surfaced-by**: operator workspace at `~/apps/tooling/` with 10+ nested repos as of 2026-05-12 (minsky, agentbrew, dotfiles, bosun, tasks.md itself, taskgrind, ideas, plus Intuit-specific repos). The Minsky observer plugin shipped 2026-05-12 surfaced the cross-repo task-filing pattern (PRs #492/#493/#494/#495/#496 fyodoriv/minsky + fyodoriv/agentbrew#1 + fyodoriv/dotfiles#30) — but the operator-side `/next-task` to consume those tasks is still single-repo. This task closes the consumer side.

## P2

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

