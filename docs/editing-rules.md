# Editing rules — full text

[`AGENTS.md`](../AGENTS.md) keeps a short summary of these rules and links here.
This file keeps the full text: code style, canonical sources, command and spec
propagation, the Agentfile, and the git-native task queue policy.

## Code Style

- TypeScript packages are strict ESM modules targeting Node.js 18+.
- Keep Markdown examples valid TASKS.md files: first line `# Tasks`, sections
  `## P0` through `## P3`, checkbox tasks, and indented bold metadata labels.
- Use fenced code blocks with a language tag, especially `markdown` for TASKS.md
  examples.
- Prefer small, obvious APIs. If two tools or flags overlap, merge behavior
  instead of adding another public command.
- Keep docs and tooling behavior in sync. README drift is a bug.
- Public publishing actions such as `npm publish`, creating releases, opening or
  merging pull requests, and pushing remote branches require explicit
  current-session operator approval.

## Canonical Source Boundaries

The root docs and command files are the source of truth. Installed copies under
agent config directories are generated mirrors; do not edit those mirrors.

### Removed agent variants

Windsurf and Devin support was removed on 2026-10-08. Do not re-add their
command variants, install targets, docs, tests, or tasks. Augment (Auggie)
stays frozen: do not touch it.

### Command Propagation

Edit only the canonical sources (`commands/next-task.md` and
`commands/lint-tasks.md`) and run `npx tasks generate-commands` to
regenerate every agent variant in one shot. The CI `commands-drift` job
runs the generator on every PR and rejects diffs in `commands/`, so a
manual edit to a generated variant fails CI.

Each canonical source regenerates a Claude skill folder, a Codex skill
folder, a Cursor command, and a Gemini TOML. The full map is in
[ARCHITECTURE.md § Cross-agent command generation](ARCHITECTURE.md#cross-agent-command-generation).

To keep a skill body under 500 lines, wrap rarely-needed detail in
`<!-- reference: <name> -->` … `<!-- /reference -->` in the canonical file.
Skill variants get it as `references/<name>.md`; Cursor and Gemini keep it inline.

Other files that may need to change in the same commit when behavior
shifts:

- `README.md` "What it does" step list and `commands/README.md` when
  user-facing behavior changes.
- `examples/complex-tasks.md` when the change illustrates a new format
  feature.

After changing a repeated term or command step, run a targeted search such as:

```bash
grep -r "<changed-term>" commands/ examples/ README.md spec.md
```

### Spec Propagation

- A metadata field change in `spec.md` must update README examples, affected
  examples, parser/linter behavior, MCP/CLI docs, and every command that reads
  or writes that field.
- A new workflow step must update README's "What it does" list and every
  `/next-task` variant.
- Examples must remain valid and should demonstrate new format features when
  they would help agents learn the pattern.

## Agentfile And MCP

`Agentfile.yaml` declares repo-local agent integrations:

```yaml
mcp:
  - context7
  - tasks-mcp
  - github
```

If you edit `Agentfile.yaml`, run `agentbrew sync` from the repo root so the MCP
configuration is deployed to all managed agents. Do not add generated agent
config files to this repo; keep shared agent tools in `commands/` or the
appropriate source repo.

## Task Queue Policy

This repo runs the **git-native backend** (`.tasksmd.json` declares
`"backend": "git-native"`) — it dogfoods the collision-free backend it recommends
for collaborative repos (VISION G8). So **`TASKS.md` here is a generated snapshot,
not the source of truth** — never hand-edit it. Task state lives in the
`tasks-claims` git ref; you mutate it through the `tasks` CLI (or the `tasks-mcp`
tools), and the projection job regenerates `TASKS.md`. The backend-aware snippet
at the end of this section is what consumers copy; see also
[`spec.md` § Task backends](spec.md#task-backends) and
[§ Fleet coordination](spec.md#fleet-coordination).

- Read `TASKS.md` (or `tasks list` / `tasks pick`) for available work. Treat
  `tasks list` as authoritative — `TASKS.md` on disk may lag the log between
  projection runs. **Repo policy** (the queue is tech-lead-curated): pick in
  priority order, focus on hardening user stories and simplifying CLI features,
  and do **not** roam beyond the `tasks.md` repo. (This lived in a `<!-- policy -->`
  comment under the file backend; on git-native it lives here, since `TASKS.md`
  is generated.)
- **Claim before working:** `tasks claim <id>` — it returns a `claimId` fencing
  token and is collision-free; a lost race exits nonzero, so pick another task.
- For non-trivial tasks, write a plan to `docs/plans/<task-id>.md` by copying
  `docs/templates/plan-template.md`, then validate it with a reviewer subagent
  (`reviewer` profile, fallback chain `qa-engineer` → `researcher`). Read
  `writing-plans` when it is installed. Plans lead with overall goal/vision and
  alternatives, distinguish facts from proposals, and use numbered tasks with
  why, dependencies/parallelism, evidence, and verification. Cross-system
  plans also define the source, transport, versioned bootstrap contract, and
  state provenance. Commit the plan + the appended `## Reviewer verdict` block
  (`**Verdict**: approved`) before any implementation commit lands. Trivial
  tasks — single file under 30 minutes with an obvious fix — skip the plan
  step. See `commands/next-task.md` § "Plan and validate" for the full rules.
- **Complete via the CLI**, never by editing `TASKS.md`: `tasks complete <id>`
  appends a `completed` event and the projection refreshes the snapshot. Add a
  task with `tasks create "<title>"`, release one with `tasks unclaim <id>`.
  History lives in the `tasks-claims` log + git.
- If a task requires public writes, external purchases, publishing, or another
  blocked action, mark it blocked (`tasks update <id> --blocked "<reason>"`)
  instead of attempting it — a blocked task is skipped by `tasks next` and
  rejected by `tasks claim`.
- Code commits that change non-markdown files should carry `Task: <id>` and
  `Task-Claim: <claimId>` trailers — the path-scoped claim-check gate
  (`.github/workflows/tasks-claim-check.yml`) requires them on protected branches.
- Commit only scoped files or hunks. Never use `git add -A`, `git add .`,
  `git reset --hard`, `git checkout --`, or `git clean -fd` in a multi-agent
  worktree.
- The `tasks-claims` ref is local until pushed: a one-time
  `git push origin refs/heads/tasks-claims` (operator action) makes the queue
  live for CI's projection job and other contributors.

The backend-aware snippet that other repos copy, and the known downstream
drift, live in [docs/task-policy-snippet.md](docs/task-policy-snippet.md).
