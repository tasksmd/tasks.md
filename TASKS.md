# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

- [ ] One-prompt setup: a developer tells their agent to "use tasks.md" and the agent does the entire setup
  - **ID**: one-prompt-setup
  - **Tags**: docs, user-story, onboarding, cli, commands, adoption, dx
  - **Details**: Add a new user story (lands as `docs/user-stories/10-one-prompt-setup.md`):

    > **I am a developer and I want to tell my agents to use tasks.md in my GitHub repo — in one step.**

    Today adoption is a manual or multi-command path: the README "Quick Start" tells the human to hand-create `TASKS.md` and paste an `AGENTS.md` snippet, and the "first 10 minutes" walkthrough runs ~9 commands (`tasks init`, `tasks install`, …). The vision is **one prompt in the README** that the developer pastes into whatever agent they use (Claude Code, Cursor, Devin, Codex, Gemini CLI, Windsurf); the agent then does the rest, end to end, with no further input.

    **Outcome-shaped** (what the developer experiences):

    1. The README has a single, prominent, copy-paste prompt block: *"Set up tasks.md in this repo."*
    2. The developer pastes it into their agent. The agent: confirms the git repo root → creates `TASKS.md` if missing → idempotently merges the `## Task Management` section into `AGENTS.md` → installs the `/next-task` (and `/lint-tasks`) command for **itself** → verifies the result → reports done. No human CLI knowledge required.
    3. Re-running is safe — it merges, never clobbering an existing `TASKS.md` or duplicating the `AGENTS.md` section.
    4. Works whether or not Node/`npx` is available (CLI path preferred; direct-file-write fallback otherwise).

    **What this requires — build on what exists (GET, don't reinvent):**

    Reuse: `tasks init` (creates `TASKS.md` + merges the `AGENTS.md` section, already idempotent — `packages/cli/src/commands/init.ts`); `tasks install` (installs `/next-task` per agent — `packages/cli/src/commands/install.ts`); `tasks generate-commands` (regenerates per-agent variants from a canonical source, CI-drift-gated — the pattern a setup command must follow, VISION G2).

    Gaps to close:
    - **(a) The prompt artifact.** Add a canonical copy-paste "set up tasks.md" prompt to the README. Recommended: make it the canonical `commands/setup.md` and regenerate per-agent `setup` command/skill variants via `tasks generate-commands`, so "the agent does the rest" is identical and deterministic across all six agents (consistent with G2 — generated, not free-handed).
    - **(b) Self-install fix (CLI bug).** `tasks install --agent <name>` silently installs nothing when the agent's own dir does not yet exist, because the detect-dir check still runs unless `--all` is also passed (`packages/cli/src/commands/install.ts`: `if (!options.all && !existsSync(detectPath)) continue;`). For a one-prompt bootstrap the calling agent (which knows its own identity) must be able to force-install its own command — make `--agent <name>` imply force (skip detection for the named agent), or add an explicit `--force`.
    - **(c) Node-optional fallback.** The prompt/command must instruct the agent: if `npx`/Node is present, use `tasks init` + `tasks install --agent <self>`; otherwise write `TASKS.md`, the `AGENTS.md` `## Task Management` section, and the agent's own command file directly from the spec + canonical command text.
    - **(d) Verifiable acceptance.** The agent finishes by running `npx -y @tasks-md/lint TASKS.md` (exit 0), confirming `AGENTS.md` has exactly one `## Task Management` section, and confirming its own command file exists at the right project-local path.
    - **(e) GitHub-repo extras (optional branches in the prompt).** Offer to add the reusable lint CI workflow (`.github/workflows/tasks-lint.yml`) and/or back the queue with the shipped GitHub Issues backend (`task_backend: github-issues`, VISION G5) for teams that live in their issue tracker.
  - **Files**: `README.md` (add the one-prompt block; trim/redirect the manual Quick Start), `docs/user-stories/10-one-prompt-setup.md` (new), `docs/user-stories/README.md` (add row 10 + table entry), `commands/setup.md` (new canonical source) + the six generated `commands/<agent>/…/setup.*` variants via `tasks generate-commands`, `packages/cli/src/commands/install.ts` (+ `install.test.ts`) for the `--agent` force-install fix, `packages/cli/src/commands/generate-commands.ts` (+ test) to emit the new `setup` command, `ROADMAP.md` (capability row).
  - **Acceptance**: (a) README contains a single copy-paste "set up tasks.md" prompt; (b) `docs/user-stories/10-one-prompt-setup.md` exists and is linked from `docs/user-stories/README.md`; (c) a `setup` command is generated for all six agents from `commands/setup.md` and the `commands-drift` CI gate stays clean; (d) `tasks install --agent <name>` force-installs that agent's command even when its dir doesn't exist yet, pinned by a new `install.test.ts` case; (e) the prompt documents the Node-optional fallback plus the idempotency and verification steps; (f) `npm run build && npm test && npm run lint` pass; (g) `npx -y @tasks-md/lint TASKS.md` exits 0.

## P1

- [ ] GitHub Issues backend: aggregate issue-backed repos alongside markdown repos in workspace mode
  - **ID**: github-issues-backend
  - **Tags**: parser, cli, mcp, next-task, github-issues, backend, workspace
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The single-repo GitHub Issues backend has shipped: `spec.md` § "Task backends" defines `tasks-md` (default) + `github-issues` (issue number ↔ id, `priority/P0..P3` label ↔ priority, assignee ↔ claim, `Closes #N` ↔ completion); the parser/CLI expose a backend-agnostic `Task` and `tasks pick`/`list`/`create`/`claim`/`complete` rank open issues on an issue-backed repo; the MCP server's task tools delegate to the `tasks` CLI for `github-issues` (`packages/mcp/src/backend.ts`); existing markdown-repo behavior is unchanged.

    The one remaining piece is **cross-backend aggregation**: when `workspace-mode-nested-repos` lands, its ranked aggregation must mix markdown repos and `github-issues` repos in a single list (a workspace repo may declare `task_backend: github-issues`). This is blocked until workspace mode exists — the backend-agnostic `Task` shape is already in place for it to build on.
  - **Files**: packages/cli/src/backend/, packages/mcp/src/backend.ts, packages/parser/src/
  - **Acceptance**: workspace-mode aggregation produces one priority-ranked list spanning both markdown and issue-backed repos; existing single-backend behavior unchanged.

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

    The right answer is a workspace mode in the canonical tasks.md tooling, since the spec + parser + MCP + CLI are the load-bearing dependencies every other tool (agentbrew, dotfiles, minsky-observer) consumes. The design MUST support **multiple workspaces on one host** as a first-class concept — single-workspace mode is just N=1.

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
    P3: 1). Findings (1):

    1. [worker-fixable] `set-up-github-pages-custom-domain`
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
    the finding and either updates the underlying task,
    removes it with reasoning in the commit message, or
    explicitly defers. Once the finding is addressed,
    remove THIS grooming task in the same commit and confirm
    `npx -y @tasks-md/lint TASKS.md` still passes.

    Bucket counts: worker-fixable=1, probable-dead=0,
    stale-claim=0, duplicate=0, spec-violation=0.

    Companion-sweep notes:
    - Archived project task entries have been removed in a prior
      commit.
    - The remaining task was last-enriched 2026-05-02 (19 days
      before this sweep), so it has cleared the 7-day
      enrichment cooldown from spec.md § "Enriching blocked
      tasks". No fresh-cooldown skips this round.
    - No `(@agent-id)` claims appear on any task, so no
      stale-claim findings to file.
    - No `TASKS-AUDIT.md` exists and `README.md`, `AGENTS.md`,
      and `spec.md` make no mention of the `sweep` convention,
      so all findings are batched inline here instead of
      staged to a separate audit file.
  - **Files**: `TASKS.md`
  - **Acceptance**: The finding above is
    addressed — task updated in-place, removed with reasoning
    in the commit message, or explicitly deferred with a
    documented rationale appended to the task. After
    resolution, this grooming task is removed in the same
    commit. Lint passes: `npx -y @tasks-md/lint TASKS.md`.
