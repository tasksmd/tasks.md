# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

- [ ] Restore npm release publishing for `v0.9.0` and future releases
  - **ID**: npm-release-publishing-blocker
  - **Tags**: release, deployment-infra, npm, ci, trusted-publishing, p0
  - **Blocked**: needs-npm-maintainer-auth — npm package trust/access settings require maintainer auth for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; unauthenticated `npm trust list` returns E401 and the npm package access UI redirects to login.
  - **Details**: GitHub release `v0.9.0` exists, but publish workflow run `26844766304` failed at `npm publish --access=public --provenance` for `@tasks-md/parser@0.9.0` with `npm error code E404` / `404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`. npm latest remains `0.7.0` for all four packages. The previous `v0.8.0` token-based workflow run `26240628732` failed with the same package PUT E404, so the unblock is package-level npm authorization, not tests/build. Preferred fix: as an npm maintainer, configure trusted publishing for each package using `npm trust github <pkg> --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/`, or replace `NPM_TOKEN` with a package-scoped granular token that has read-write publish permission and bypasses 2FA. See `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`.
  - **Files**: `.github/workflows/publish.yml`, `packages/*/package.json`, `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`
  - **Acceptance**: (a) each package has either a trusted publisher for `tasksmd/tasks.md` + `.github/workflows/publish.yml` with publish allowed, or the repo `NPM_TOKEN` secret is replaced by a valid publish-capable token; (b) rerunning the `v0.9.0` publish workflow or creating a replacement release publishes `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; (c) `npm view @tasks-md/parser version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/lint version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/cli version --registry=https://registry.npmjs.org/`, and `npm view tasks-mcp version --registry=https://registry.npmjs.org/` all return `0.9.0` or newer; (d) the release workflow's version-bump commit lands on `main`; (e) `npm run lint` and `npx -y @tasks-md/lint TASKS.md` pass.

## P1

- [ ] GitHub Issues backend: aggregate issue-backed repos alongside markdown repos in workspace mode
  - **ID**: github-issues-backend
  - **Tags**: parser, cli, mcp, next-task, github-issues, backend, workspace
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The single-repo GitHub Issues backend has shipped: `spec.md` § "Task backends" defines `tasks-md` (default) + `github-issues` (issue number ↔ id, `priority/P0..P3` label ↔ priority, assignee ↔ claim, `Closes #N` ↔ completion); the parser/CLI expose a backend-agnostic `Task` and `tasks pick`/`list`/`create`/`claim`/`complete` rank open issues on an issue-backed repo; the MCP server's task tools delegate to the `tasks` CLI for `github-issues` (`packages/mcp/src/backend.ts`); existing markdown-repo behavior is unchanged.

    The one remaining piece is **cross-backend aggregation**: when `workspace-mode-nested-repos` lands, its ranked aggregation must mix markdown repos and `github-issues` repos in a single list (a workspace repo may declare `task_backend: github-issues`). This is blocked until workspace mode exists — the backend-agnostic `Task` shape is already in place for it to build on.
  - **Files**: packages/cli/src/backend/, packages/mcp/src/backend.ts, packages/parser/src/
  - **Acceptance**: workspace-mode aggregation produces one priority-ranked list spanning both markdown and issue-backed repos; existing single-backend behavior unchanged.

- [ ] Define fleet-safe workspace and cross-repo claiming semantics
  - **ID**: fleet-claim-workspace-semantics
  - **Tags**: workspace, git-native, fleet, backend, multi-repo, multi-workspace, claiming
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The approved fleet plan is explicitly single-repo v1, while workspace mode aggregates many repos and backends. Before making workspace mode fleet-aware, define the semantics: a global workspace picker may rank across repos, but claims are written to the selected repo's backend. Cross-repo/cross-workspace blockers must be read consistently without pretending there is a global atomic transaction.

    Required changes:
    1. Specify how workspace aggregation discovers each repo's backend and capability flags.
    2. Define claim flow for a ranked cross-workspace pick: pick globally, claim atomically in the target repo backend, then re-rank on claim loss.
    3. Define cross-repo blocker resolution when some repos use file backend and others use git-native or issues.
    4. State what is not supported: atomic multi-repo claim/complete, global leases spanning repos, and cross-repo generated snapshot writes unless a later backend provides them.
    5. Add conformance or integration tests for two agents racing through workspace aggregation into the same target repo.
  - **Files**: `spec.md`, `packages/parser/src/workspace.ts`, `packages/cli/src/commands/next.ts`, `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.ts`, `packages/conformance/`, `README.md`
  - **Acceptance**: Workspace docs explain per-repo backend capabilities; concurrent workspace picks cannot both claim the same target-repo task when that repo uses git-native; mixed-backend limitations are explicit; tests cover claim-loss re-rank and cross-repo blocker resolution.

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
          exclude: ["archived-repo"]
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
  - **Acceptance**: Behind explicit operator approval for the external DNS / Pages change: a `CNAME` file (or the GitHub Pages custom-domain setting) points the site at the purchased domain; the README website link is updated to the new domain; `docs/index.html` is rebuilt via `npm run build:site` against the new URL; `npm run build:site` and `npx -y @tasks-md/lint TASKS.md` pass.
  - **Last-enriched**: 2026-05-02
