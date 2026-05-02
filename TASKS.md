# Tasks

## P0

## P1

- [ ] Users can target a specific task ID with `/next-task` so standing loops are reusable across repos
  - **ID**: next-task-target-task-id
  - **Tags**: commands, workflow, queue
  - **Details**: Repos are starting to share standing task IDs like
    `standing-audit-gap-loop`, but `/next-task` currently only auto-picks from the
    queue. Add a documented optional task-ID argument so `/next-task standing-audit-gap-loop`
    means "work that exact task if it exists and is actionable; otherwise explain why not."
    This should work the same way across every command variant so teams can reuse the same
    queue-driving prompt in different repos and agents.
  - **Files**: `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md`, `README.md`
  - **Acceptance**: Every `next-task` variant documents and supports the same optional task-ID
    targeting behavior, including the blocked/claimed/missing-task cases.

- [ ] Projects can express recurring audit-only queue-filling loops without copying a giant bespoke task into every repo
  - **ID**: standing-loop-pattern
  - **Tags**: spec, workflow, queue
  - **Details**: Bosun and AgentBrew both want a recurring "audit the repo, compare competitors,
    and only write tasks" loop. Today the only way to express that is a long repo-local task block.
    Define one official reusable pattern — whether that ends up being a standard task template, a
    compact metadata convention, or a dedicated shared command — so teams can keep repo-specific
    audit inputs small while reusing the same operator loop everywhere.
  - **Files**: `spec.md`, `README.md`, `examples/complex-tasks.md`, `commands/next-task.md`, `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md`
  - **Acceptance**: TASKS.md has one documented, cross-agent pattern for recurring audit-only
    loops, including where repo-specific context belongs and how agents should execute it.

## P2

- [ ] tasks-mcp can target a known task ID so automation does not need custom file logic
  - **ID**: tasks-mcp-targeted-task-parity
  - **Tags**: mcp, workflow, queue
  - **Details**: `/next-task` is gaining targeted task-ID routing and a reusable standing-loop
    pattern, but agents that drive TASKS.md through `tasks-mcp` still only get the generic pick
    flow or fuzzy query matching on claim and complete. Add an MCP-side exact-task entry point so
    higher-level automation can run the same queue behavior through tools instead of re-implementing
    file parsing and eligibility checks.
  - **Files**: `packages/mcp/src/tools.ts`, `packages/mcp/src/tools.test.ts`, `packages/parser/src/index.ts`, `packages/mcp/README.md`, `README.md`
  - **Blocked by**: `next-task-target-task-id`, `standing-loop-pattern`
  - **Acceptance**: The MCP server exposes one documented way to fetch and optionally claim a
    specific task by ID with clear missing, claimed, and blocked behavior, and the docs explain how
    that path composes with standing loops once the shared pattern lands.

- [ ] README shows when to use plain `/next-task`, targeted `/next-task <task-id>`, and any standing-loop pattern
  - **ID**: next-task-readme-routing
  - **Tags**: docs, workflow, onboarding
  - **Details**: Once `next-task` can target known tasks and TASKS.md has a reusable standing-loop
    pattern, the README needs a clear routing story. A new user should understand when to let the
    queue choose automatically, when to point at a specific task ID, and when a recurring audit
    loop is the right tool.
  - **Files**: `README.md`
  - **Acceptance**: The README teaches the three queue-entry modes with examples that are consistent
    with the command and spec.

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

- [ ] Reconcile session 18 docs/taskgrind work onto main
  - **ID**: reconcile-session-18-docs
  - **Tags**: docs, spec, taskgrind, delivery
  - **Details**: Branch `task/next-task-target-task-id` (now pushed to
    origin) holds five session-18 commits that documented agent-managed
    task metadata and aligned taskgrind terminology. None are reachable
    from PR #33 / current main. Cherry-pick or re-apply: `9de5baa` chore:
    ignore taskgrind session state artifact (adds `.taskgrind-state` to
    `.gitignore`). `a4d0b1f` fix: align taskgrind `**Blocked**` field
    terminology in `taskgrind/scripts/check-zero-ship-streak.mjs` and
    `commands/next-task.md`. `447117d` docs: document agent-managed
    `**Plan**` and `**Parent**` task metadata in `spec.md` and
    `commands/lint-tasks.md`. `174d5df` docs: document the taskgrind
    `closes <task-id>` commit convention in `spec.md` and
    `taskgrind/prompt-template.md`. `4b5f571` docs: refresh AGENTS.md
    baseline (verify this isn't already covered by the session-31 baseline
    refresh on `cbd24be` before applying — pick the newer of the two).
  - **Files**: `.gitignore`, `AGENTS.md`, `spec.md`,
    `commands/lint-tasks.md`, `commands/next-task.md`,
    `taskgrind/scripts/check-zero-ship-streak.mjs`,
    `taskgrind/prompt-template.md`
  - **Acceptance**: All five (or four, if `4b5f571` is superseded)
    commits land on `main` via a PR. Branch
    `task/next-task-target-task-id` is deleted after delivery.

- [ ] Re-export targeted-ID parser API from `@tasks-md/parser`
  - **ID**: parser-api-target-id-exports
  - **Tags**: parser, api, mcp, refactor
  - **Blocked by**: `next-task-target-task-id`
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
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.

- [ ] Refresh tasks.md AGENTS.md to match the shared agent-tool repo baseline
  - **ID**: refresh-tasks-md-agent-guide-baseline
  - **Tags**: agents, docs, agentbrew, tasks-md
  - **Details**: Cross-repo audit on 2026-04-30 found that `AGENTS.md` still
    describes this as a Markdown-only spec repo with no build step, while the
    repo now has package workspaces for parser, lint, MCP, and CLI code plus
    canonical command variants. Bring it up to the same baseline as the other
    agent-tool repos so agents know the real verification and propagation
    workflow.
  - **Files**:
    - `AGENTS.md`
    - `Agentfile.yaml`
    - `package.json`
    - `commands/`
    - `examples/`
    - `TASKS.md`
  - **Acceptance**:
    - `AGENTS.md` includes purpose, repo layout, development commands,
      verification gate, task queue policy, Agentfile/agentbrew sync path, and
      canonical-source boundaries for command variants
    - The stale "no build step" guidance is replaced with the actual package
      scripts and when to run each one
    - The next-task/lint-tasks propagation rule remains explicit and points to
      every generated variant that must change together
    - `npm run lint`, `npm test`, and `npx -y @tasks-md/lint TASKS.md` pass

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
