# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

## P1

- [ ] Per-package README consistency audit — same structure across cli, lint, parser, mcp
  - **ID**: docs-package-readme-consistency
  - **Tags**: docs, packages, simplify, hardening
  - **Details**: The four published packages have separate
    READMEs (`packages/cli/README.md`, `packages/lint/README.md`,
    `packages/parser/README.md`, `packages/mcp/README.md`) that
    drifted in shape over time. Audit and unify the top-level
    structure: every README should have the same headings in the
    same order — `# <package-name>` (1-line tagline), `##
    Install`, `## Use` (the canonical use case in 5-10 lines),
    `## API` (TypeScript-exposed types/functions or CLI flags),
    `## See also` (link to spec.md, root README, related
    packages). Drop any "Why this exists" / "Background"
    rambling that lives outside that frame. Produce a single docs
    PR. Verify each README passes `npm run lint` and that internal
    links resolve. The PR's diff should be net-negative or
    near-neutral (consolidation, not addition).
  - **Files**: `packages/cli/README.md`,
    `packages/lint/README.md`,
    `packages/parser/README.md`,
    `packages/mcp/README.md`
  - **Acceptance**: All four READMEs share the same five
    top-level headings (`Install`, `Use`, `API`, `See also`, plus
    the H1). Cross-links between packages resolve. Net diff is
    near-zero. `npm run lint`, `npx -y @tasks-md/lint TASKS.md`
    pass.
  - **Last-enriched**: 2026-05-03

## P2

- [ ] MCP tool descriptions audit — match the parallel-structure rule applied to CLI commands
  - **ID**: mcp-tool-descriptions-parallel
  - **Tags**: mcp, simplify, polish, dx
  - **Details**: After PR #67 pinned CLI command descriptions
    into a verb-first, ≤60-char shape, the MCP server's tool
    descriptions in `packages/mcp/src/index.ts` weren't checked.
    The MCP exposes 7 tools: `list_tasks`, `pick_task`,
    `claim_task`, `unclaim_task`, `complete_task`, `add_task`,
    plus parser inspection helpers. Each has a `description:` in
    its `server.tool(...)` call. Audit them for the same
    parallel structure used by the CLI (see PR #67 + the regex
    pinned in `cli.test.ts`), tighten any drifters, and add a
    test in `packages/mcp/src/tools.test.ts` that asserts every
    registered tool description matches the same regex. Drop
    redundancy in MCP-vs-CLI descriptions where they mirror each
    other (e.g., MCP `list_tasks` and CLI `list` should differ
    only in the verb-noun, not the framing).
  - **Files**: `packages/mcp/src/index.ts`,
    `packages/mcp/src/tools.test.ts`
  - **Acceptance**: All 7 MCP tool descriptions follow the
    parallel structure (verb-first, ≤60 chars). New regex test
    in `tools.test.ts` enforces the rule. `npm run build`, `npm
    test`, `npm run lint` pass.
  - **Last-enriched**: 2026-05-03

- [ ] Linter error messages — make every error actionable (state the fix)
  - **ID**: lint-actionable-errors
  - **Tags**: lint, dx, hardening
  - **Details**: `packages/lint/src/lint.ts` emits errors via
    `reportError(...)`. Some messages name the violation but
    don't tell the reader how to fix it. Examples to audit:
    `"first line must be '# Tasks', got '<x>'"` — good (says the
    fix). `"completed task should be removed, not checked off"`
    — good (says the fix: remove). `"policy directive found
    outside HTML comment — wrap in <!-- policy: ... -->"` —
    good. Audit the rest of the error catalog and ensure every
    message ends with a clause that names the fix (`; do X`, `;
    use Y`, `; remove the field if Z`). Add a lint-of-the-linter
    test in `lint.test.ts` that scans `lint.ts` for every
    `reportError(` call and asserts the message matches a regex
    that requires either `;` followed by an imperative, or `→`
    followed by a fix, or `must` / `should` / `use` keywords.
    Pin the actionability contract.
  - **Files**: `packages/lint/src/lint.ts`,
    `packages/lint/src/lint.test.ts`
  - **Acceptance**: Every `reportError(...)` call in `lint.ts`
    emits a message that names the fix. New test in `lint.test.ts`
    enforces the contract via a regex. `npm run build`, `npm test`,
    `npm run lint` pass.
  - **Last-enriched**: 2026-05-03

- [ ] Story 09 — Standing audit loops in practice (one full walkthrough)
  - **ID**: user-stories-09-standing-loops-walkthrough
  - **Tags**: docs, user-stories, standing-loops, hardening
  - **Details**: Story 08 introduced standing audit loops as a
    pattern. Story 09 should walk through one full cycle so
    readers see them in action. New file
    `docs/user-stories/09-standing-audit-loops.md` covering:
    (1) When you'd reach for a standing loop (recurring queue
    refill, scheduled audit cadence, post-deploy checklist).
    (2) The exact TASKS.md shape — task block with the
    `standing-loop` tag and ID `standing-audit-gap-loop` (or
    similar). Show `tasks pick` skipping it during normal queue
    walks; show `/next-task standing-audit-gap-loop` targeting
    it explicitly. (3) The agent's Tier-1/Tier-2 audit loop —
    audit, file findings, exit; humans (or other sessions)
    drain the findings on the next normal pass. (4) Anti-pattern:
    don't make every task a standing loop — that's just a queue
    of audit prompts with no work. (5) `## Try it yourself`
    section at the end (matches the pattern PR #60 established).
    Cross-link from `docs/user-stories/README.md` table; from
    story 08; and from the spec's standing-loops section.
  - **Files**: `docs/user-stories/09-standing-audit-loops.md`
    (new), `docs/user-stories/README.md`,
    `docs/user-stories/08-rich-task-metadata.md`, `spec.md`
    (cross-link only — do not modify the spec itself)
  - **Acceptance**: New story 09 exists with the 5 sections and
    a Try-it-yourself demo. `docs/user-stories/README.md` table
    has the new row in the right priority (07 → 08 → 09).
    `spec.md` standing-loops section gets a one-line link "see
    story 09 for a worked example". `npm run lint`, `npx -y
    @tasks-md/lint TASKS.md` pass.
  - **Last-enriched**: 2026-05-03

- [ ] Examples directory audit — every file lints clean and demonstrates a distinct feature
  - **ID**: examples-directory-audit
  - **Tags**: docs, examples, hardening, lint
  - **Details**: `examples/` ships TASKS.md fixtures that act as
    documentation. Run `npx -y @tasks-md/lint examples/` and
    enumerate the files: each should (a) lint clean (zero
    errors), (b) demonstrate a distinct format feature (basic
    one-liners, rich metadata, blocked + research, parent-child
    decomposition, monorepo per-package, standing loop,
    policies, mixed priorities, etc.), and (c) have a one-line
    intro comment at the top stating which feature it
    demonstrates. Build a small overview file
    `examples/README.md` (or update existing one) that lists
    every example with a one-line description and the spec
    section it demonstrates. Add a CI smoke that lints every
    file in `examples/` (in `.github/workflows/` if not already).
  - **Files**: `examples/*.md`, `examples/README.md` (may
    already exist), `.github/workflows/tasks-lint.yml` (verify it
    covers `examples/`)
  - **Acceptance**: Every file in `examples/` lints clean. Each
    has a one-line intro comment naming the demonstrated
    feature. `examples/README.md` lists every example with a
    one-line description. CI includes `examples/` in the lint
    target. `npm run build`, `npm test`, `npm run lint`, `npx
    -y @tasks-md/lint TASKS.md` pass.
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

