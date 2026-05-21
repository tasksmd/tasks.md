# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

## P1

- [ ] Workspace mode: parser, CLI, MCP, and `/next-task` aggregate TASKS.md files across nested repos in **one or more workspaces** on one host
  - **ID**: workspace-mode-nested-repos
  - **Tags**: spec, parser, cli, mcp, next-task, workspace, multi-repo, multi-workspace
  - **Details**: Operators frequently have **multiple** workspace folders on the same host, each containing many nested repos. The operator at 2026-05-12 has 5 workspaces under `~/apps/`:

    | Workspace root | Nested repos | TASKS.md count |
    |---|---|---|
    | `~/apps/tooling/` | 13 | 10 |
    | `~/apps/oncall-hub/` | 3 | 2 |
    | `~/apps/learning/` | 2 | 1 |
    | `~/apps/_inventory/` | 2 | 1 |
    | `~/apps/docs/` | 2 | 0 |

    Plus many standalone repos sitting directly under `~/apps/` (authproxy, career-advancement, code-smells, etc.) that are NOT workspaces — they're individual repos in the same parent directory.

    Today `/next-task` reads `./TASKS.md` only — there's no first-class way to (a) pick the highest-priority unblocked task across one workspace, OR (b) pick across all workspaces on the host. Friction scales with workspace count × repo count.

    The right answer is a workspace mode in the canonical tasks.md tooling, since the spec + parser + MCP + CLI are the load-bearing dependencies every other tool (agentbrew, dotfiles, minsky-observer, taskgrind) consumes. The design MUST support **multiple workspaces on one host** as a first-class concept — single-workspace mode is just N=1.

    **Outcome-shaped** (what a workspace-aware operator sees):

    1. Operator runs `tasks next` from anywhere — if `~/.config/tasks-md/workspaces.yaml` declares ≥ 1 workspace AND the operator didn't pass an explicit scope, the tool aggregates across **every declared workspace**, prints a one-line "scanned N workspaces, M repos, K unblocked", and picks the global highest-priority task.
    2. Operator can scope explicitly: `tasks --workspace ~/apps/tooling next` (one) OR `tasks --workspaces ~/apps/tooling,~/apps/oncall-hub next` (named list) OR `tasks --workspace tooling next` (config-name lookup).
    3. Output names the workspace + repo + task ID + title. Claiming the task and editing TASKS.md happens inside the corresponding repo's checkout.
    4. Cross-workspace `**Blocked by**:` references (e.g. `**Blocked by**: oncall-hub::api#fix-ratelimit`) are recognised and resolved. Cross-repo within-workspace (`**Blocked by**: agentbrew#agentfile-command-sources`) keeps working. Single-repo (`**Blocked by**: <task-id>`) keeps working.
    5. Auto-discovery: when no workspaces config exists, the CLI offers to scan `~/apps/` (or a configurable scan-root list) for `.tasks-md-workspace` sentinel files + writes the discovered workspaces into the config on operator approval.

    **Spec extension** (`spec.md`):

    - New § "Workspaces": a workspace is any directory marked by `.tasks-md-workspace` (sentinel file, similar to `.git`) OR a directory containing ≥ 2 immediate child dirs each carrying a `TASKS.md`. The sentinel takes precedence and may declare repo discovery globs explicitly.
    - New § "Multiple workspaces on one host": multiple workspaces are declared in a per-user config at `~/.config/tasks-md/workspaces.yaml` (XDG-friendly; honours `$XDG_CONFIG_HOME`). One workspace per machine is `N=1` of the same model — there is no separate "single workspace" code path.
    - Cross-workspace blocker reference: `**Blocked by**: <workspace-name>::<repo-name>#<task-id>` (workspace name comes from the config; defaults to last-path-segment of the workspace root). Cross-repo within-workspace: `<repo-name>#<task-id>`. Single-repo: `<task-id>`. The colon-colon is the workspace separator (analogous to C++ namespace syntax — operator-friendly + spec-stable).
    - `~/.config/tasks-md/workspaces.yaml` schema (YAML):

      ```yaml
      workspaces:
        - name: tooling
          root: ~/apps/tooling
          # optional:
          exclude: ["dotfiles-intuit.bundle"]
          priorityWeight: 1.0
        - name: oncall-hub
          root: ~/apps/oncall-hub
          priorityWeight: 0.8
      discovery:
        scanRoots: [~/apps]   # where auto-detect looks for .tasks-md-workspace sentinels
        autoDetect: true       # when true, `tasks next` offers to add discovered workspaces
      ```

      `priorityWeight` is optional per-workspace modifier when two workspaces' priorities legitimately differ in user importance (P0-in-tooling beats P1-in-oncall-hub by default; raising `oncall-hub`'s weight inverts that without rewriting any task block).
    - `.tasks-md-workspace` per-workspace schema (YAML): same as before but adds nothing global — purely local to the workspace.

    **Implementation surfaces**:

    - `@tasks-md/parser`: new `parseWorkspaces(roots: string[]): Map<workspaceRoot, ParsedTask[]>` returning per-workspace results. New `parseWorkspace(root)` returning single-workspace results (delegates to `parseWorkspaces([root])`). Single-file `parse()` stays unchanged.
    - `tasks` CLI:
      - `--workspace <path>` (singular) — one workspace
      - `--workspaces <path1,path2,...>` (plural, comma-separated)
      - `--workspace-name <name>` — looks up the workspace by name from the config
      - default behaviour (no flag): if `~/.config/tasks-md/workspaces.yaml` exists AND has ≥ 1 entry, aggregate across all declared. Otherwise fall through to single-`./TASKS.md` mode (preserves backwards compat).
      - `tasks workspaces list` — prints discovered + configured workspaces.
      - `tasks workspaces add <path> [--name <name>]` — adds to the config.
      - `tasks workspaces detect [--scan-root <path>]` — scans for sentinels, prompts to add.
    - `tasks-mcp` (MCP server): new tool `find_next_task_across_workspaces({workspaces?: string[]})` — when `workspaces` is omitted, reads the per-user config. Returns `{workspace, repo, task_id, file_path}`. The existing `find_next_task` stays single-repo for backwards compat.
    - `commands/next-task.md` canonical source: a new step `0. Workspace detection` — if `~/.config/tasks-md/workspaces.yaml` declares ≥ 1 workspace, surface "Configured workspaces (N): tooling (10 repos), oncall-hub (3 repos). Pick across all, scope to one, or single-repo? [all/<name>/single]" before falling through to single-repo. If the config doesn't exist BUT auto-detect finds sentinels, offer the one-time add. All 6 generated agent variants regenerate via `npx tasks generate-commands`.

    Cross-repo dependencies on this feature: agentbrew gains a workspace-aware `agentbrew sync --workspaces <list>` (filed as a companion task in that repo); dotfiles gains a `dotfiles-doctor` workspace section that iterates every declared workspace (companion task there).
  - **Files**: `spec.md` (§ Workspaces + § Multiple workspaces on one host), `examples/workspace.md` (new — example workspace) + `examples/multi-workspace-host.md` (new — N=2+ example), `packages/parser/src/workspace.ts` (new, both `parseWorkspace` + `parseWorkspaces`), `packages/parser/src/workspace.test.ts` (new, paired), `packages/cli/src/commands/next.ts` (extend with `--workspace` / `--workspaces` / `--workspace-name`), `packages/cli/src/commands/lint.ts` (extend), `packages/cli/src/commands/list.ts` (extend), `packages/cli/src/commands/workspaces.ts` (new — `list` / `add` / `detect`), `packages/cli/src/config/workspaces.ts` (new — reads/writes `~/.config/tasks-md/workspaces.yaml`), `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.ts` (new), `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.test.ts` (new), `commands/next-task.md` (canonical workspace step), `commands/lint-tasks.md` (workspace flag), `README.md` (workspace + multi-workspace quickstart), all 6 generated agent variants under `commands/<agent>/` (regenerated via `npx tasks generate-commands`).
  - **Acceptance**: (a) `tasks --workspaces ~/apps/tooling,~/apps/oncall-hub next` exits 0 + prints `<workspace>::<repo>:<task-id>` for the highest-priority unblocked task across both; (b) `parseWorkspaces([root1, root2])` returns per-workspace task lists; (c) cross-workspace `**Blocked by**: <workspace>::<repo>#<task-id>` is recognised + resolved; (d) `tasks workspaces list` prints both configured and auto-detected workspaces; (e) `tasks workspaces add ~/apps/oncall-hub --name oncall-hub` writes to `~/.config/tasks-md/workspaces.yaml`; (f) `tasks-mcp` exposes `find_next_task_across_workspaces`; (g) `commands/next-task.md` step list regenerated across all 6 agents; (h) `npm run build && npm test` pass; (i) `npx tasks generate-commands` is clean (commands-drift CI gate); (j) backwards compat: when no workspaces config exists, `tasks next` still reads `./TASKS.md` unchanged.
  - **Surfaced-by**: operator multi-workspace setup at `~/apps/` containing 5 workspaces (`tooling`, `oncall-hub`, `learning`, `_inventory`, `docs`) as of 2026-05-12, plus 60+ standalone individual repos that are NOT workspaces. The Minsky observer plugin shipped 2026-05-12 surfaced the cross-repo task-filing pattern within one workspace (`tooling`) — extending to N workspaces on one host is the same architectural arc.

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

- [ ] Groom TASKS.md per 2026-05-21 companion sweep
  - **ID**: tasks-groom-2026-05-21-companion
  - **Tags**: tasks, grooming, companion
  - **Details**:
    Generated by `companion-task-groom` on 2026-05-21.
    Lint status: pass — `npx -y @tasks-md/lint TASKS.md` exits 0
    with 0 errors. Total tasks before this append: 3 (P2: 2,
    P3: 1). Findings (3):

    1. [probable-dead] `taskgrind-per-session-sync` (P2, line
       13). All 5 paths in `**Files**` live in
       `/Users/fivanishche/apps/taskgrind/` (`bin/taskgrind`,
       `lib/constants.sh`, `tests/git-sync.bats`, `README.md`,
       `man/taskgrind.1`), but that directory does not exist
       on this host. The in-repo `taskgrind/` subdir at
       `/Users/fivanishche/apps/tooling/tasks.md/taskgrind/`
       only contains `prompt-template.md`, `README.md`, and
       `scripts/` — none of the referenced paths match. The
       task's `**Research**` field also pins line numbers in
       the same dead paths (`bin/taskgrind:673`,
       `bin/taskgrind:5413`, `lib/constants.sh:35`, etc.).
       Last-enriched 2026-05-02. Action: confirm with operator
       whether the taskgrind tool still exists at a different
       path, then either refresh `**Files**` / `**Research**`
       against the new location or retire the task with a
       commit message noting the repo is gone.

    2. [probable-dead] `bosun-orphan-main-commit-924f8f14` (P2,
       line 99). `**Files**` references
       `/Users/fivanishche/apps/bosun/skill-plugins/orchestrator/orchestrator-user/SKILL.md`,
       but `/Users/fivanishche/apps/bosun/` does not exist
       anywhere under `/Users/fivanishche/apps/` on this host
       (verified with `find /Users/fivanishche/apps -maxdepth 4
       -name bosun` returning empty). The orphan commit
       `924f8f14` was on that repo's local `main`, so if the
       repo is gone the deliverable is presumably also gone.
       Last-enriched 2026-05-02. Action: confirm whether bosun
       was renamed, archived, or retired; if the orphan commit
       no longer needs delivery, remove the task with a commit
       message noting the bosun repo is gone.

    3. [worker-fixable] `set-up-github-pages-custom-domain`
       (P3, line 129). Carries `**ID**`, `**Tags**`,
       `**Blocked**`, `**Details**`, `**Research**`, `**Files**`,
       and `**Last-enriched**`, but no `**Acceptance**` line.
       The spec lists Acceptance as optional, but the
       finish-line here is concrete (CNAME committed, Pages
       setting points at the new domain, README link updated,
       `docs/index.html` rebuilt against the new URL — all
       behind explicit operator approval for the external DNS
       / Pages change). Action: append an `**Acceptance**`
       line capturing those criteria so a future agent knows
       what "done" looks like.

    Suggested resolution path: worker (or operator) reviews
    each finding and either updates the underlying task,
    removes it with reasoning in the commit message, or
    explicitly defers. Once all three findings are addressed,
    remove THIS grooming task in the same commit and confirm
    `npx -y @tasks-md/lint TASKS.md` still passes.

    Bucket counts: worker-fixable=1, probable-dead=2,
    stale-claim=0, duplicate=0, spec-violation=0.

    Companion-sweep notes:
    - Both probable-dead tasks already carry
      `**Blocked**: needs-user-approval` for cross-repo writes,
      so they were already unpickable. The dead-files finding
      just promotes them from "blocked-but-someday" to
      "blocked AND likely obsolete".
    - All three tasks were last-enriched 2026-05-02 (19 days
      before this sweep), so they have cleared the 7-day
      enrichment cooldown from spec.md § "Enriching blocked
      tasks". No fresh-cooldown skips this round.
    - No `(@agent-id)` claims appear on any task, so no
      stale-claim findings to file.
    - No `TASKS-AUDIT.md` exists and `README.md`, `AGENTS.md`,
      and `spec.md` make no mention of the `sweep` convention,
      so all findings are batched inline here instead of
      staged to a separate audit file.
  - **Files**: `TASKS.md`
  - **Acceptance**: Each of the three findings above is
    addressed — task updated in-place, removed with reasoning
    in the commit message, or explicitly deferred with a
    documented rationale appended to the task. After
    resolution, this grooming task is removed in the same
    commit. Lint passes: `npx -y @tasks-md/lint TASKS.md`.
