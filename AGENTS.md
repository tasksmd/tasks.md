# AGENTS.md - tasks.md Codebase Guide

## What This Repo Is

`tasks.md` defines the TASKS.md task-queue specification and ships the
supporting tools that make the format useful for humans and agents:

- `spec.md` is the canonical format specification.
- `README.md` is the landing page and quick start.
- `examples/` contains valid TASKS.md examples used as documentation fixtures.
- `packages/parser` parses task files, metadata, blockers, claims, and policies.
- `packages/lint` validates task files against the spec.
- `packages/mcp` exposes TASKS.md operations through the Model Context Protocol.
- `packages/cli` provides the `tasks` command-line interface.
- `commands/` contains the shared `/next-task` and `/lint-tasks` command variants
  for Claude Code, Codex, Cursor, Devin, Gemini CLI, and Windsurf.

## Repo Layout

```text
tasks.md/
+-- spec.md                         # Canonical TASKS.md format spec
+-- README.md                       # User-facing docs and quick start
+-- Agentfile.yaml                  # Repo-local agentbrew MCP manifest
+-- TASKS.md                        # Local task queue for this repo
+-- examples/                       # Valid TASKS.md example files
+-- commands/
|   +-- next-task.md                # Shared canonical /next-task source
|   +-- lint-tasks.md               # Shared canonical /lint-tasks source
|   +-- claude/skills/*/SKILL.md    # Claude Code skill variants
|   +-- codex/skills/*/SKILL.md     # OpenAI Codex skill variants
|   +-- cursor/*.md                 # Cursor command variants
|   +-- devin/skills/*/SKILL.md     # Devin skill variants
|   +-- gemini/*.toml               # Gemini CLI command variants
|   +-- windsurf/*.md               # Windsurf workflow variants
+-- packages/
|   +-- parser/                     # @tasks-md/parser TypeScript package
|   +-- lint/                       # @tasks-md/lint and tasks-lint binary
|   +-- mcp/                        # tasks-mcp server
|   +-- cli/                        # @tasks-md/cli and tasks binary
```

## Development

This is an npm workspace repo. Install dependencies once, then run commands from
the repo root unless a package README says otherwise.

```bash
npm install                         # Install workspace dependencies
npm run build                       # Type-check and build parser, lint, MCP, CLI
npm run build:site                  # Rebuild the static docs site
npm run lint                        # Run local TASKS.md lint via built package
npm test                            # Run all workspace tests
npm run test:cached                 # Cached test wrapper for repeated local runs
npx -y @tasks-md/lint TASKS.md      # Validate the public linter package path
```

Package-level commands also work with npm workspaces:

```bash
npm run build -w packages/parser
npm test -w packages/mcp
```

## Verification Gate

Before committing a normal change, run the smallest gate that covers the files
you touched, then run the full gate for cross-package or command/spec changes:

- **Docs-only / TASKS.md edits**: `npm run lint` and `npx -y @tasks-md/lint TASKS.md`.
- **Spec, parser, lint, MCP, CLI, or command behavior**: `npm run build`, `npm test`,
  `npm run lint`, and `npx -y @tasks-md/lint TASKS.md`.
- **README or website changes**: include `npm run build:site` when rendered site output
  could change.

Do not claim work is complete until the verification commands you ran have
finished successfully. Never bypass hooks with `--no-verify` unless the user has
explicitly approved that exact action in the current session.

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

### Command Propagation

Edit only the canonical sources (`commands/next-task.md` and
`commands/lint-tasks.md`) and run `npx tasks generate-commands` to
regenerate every agent variant in one shot. The CI `commands-drift` job
runs the generator on every PR and rejects diffs in `commands/`, so a
manual edit to a generated variant fails CI.

Generated variants regenerated from each canonical source:

| Canonical | Generated variants |
|-----------|--------------------|
| `commands/next-task.md` | `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md` |
| `commands/lint-tasks.md` | `commands/claude/skills/lint-tasks/SKILL.md`, `commands/codex/skills/lint-tasks/SKILL.md`, `commands/cursor/lint-tasks.md`, `commands/devin/skills/lint-tasks/SKILL.md`, `commands/gemini/lint-tasks.toml`, `commands/windsurf/lint-tasks.md` |
| `commands/setup.md` | `commands/claude/skills/setup/SKILL.md`, `commands/codex/skills/setup/SKILL.md`, `commands/cursor/setup.md`, `commands/devin/skills/setup/SKILL.md`, `commands/gemini/setup.toml`, `commands/windsurf/setup.md` |
| `commands/migrate.md` | `commands/claude/skills/migrate/SKILL.md`, `commands/codex/skills/migrate/SKILL.md`, `commands/cursor/migrate.md`, `commands/devin/skills/migrate/SKILL.md`, `commands/gemini/migrate.toml`, `commands/windsurf/migrate.md` |

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

This repo runs the **file backend** (`tasks-md`) — there is no `.tasksmd.json`, so
`TASKS.md` is the live source of truth and the claim/complete mechanics below are
the file-backend ones. A repo on a **generated backend** (`git-native` or
`github-issues`, declared in `.tasksmd.json`) treats `TASKS.md` as a generated
snapshot and mutates state through the CLI/MCP instead — see the backend-aware
snippet at the end of this section and [`spec.md` § Task backends](spec.md#task-backends).

- Read `TASKS.md` before starting work and obey any `<!-- policy: ... -->`
  comments.
- **Determine the backend first.** No `.tasksmd.json` (or `"backend": "tasks-md"`)
  → file backend: hand-edit `TASKS.md` as below. Otherwise → run `tasks claim`/
  `tasks complete`/`tasks create` and never hand-edit the generated `TASKS.md`.
- **File backend:** claim tasks by appending your agent identity, for example
  `(@devin-session-17)`. **Generated backend:** `tasks claim <id>` (git-native
  returns a `claimId` fencing token; a lost race exits nonzero — pick another task).
- For non-trivial tasks, write a plan to `docs/plans/<task-id>.md` by copying
  `docs/templates/plan-template.md`, then validate it with a reviewer subagent
  (`reviewer` profile, fallback chain `qa-engineer` → `researcher`). Commit
  the plan + the appended `## Reviewer verdict` block (`**Verdict**: approved`)
  before any implementation commit lands. Trivial tasks — single file under 30
  minutes with an obvious fix — skip the plan step. The legacy `**Plan**:`
  TASKS.md checklist is superseded; see `commands/next-task.md` § "Plan and
  validate" for the full rules.
- Do not mark completed tasks `[x]`. **File backend:** remove the entire task
  block (line + all metadata + plan lines) in the completing commit. **Generated
  backend:** run `tasks complete <id>` (git-native appends a `completed` event;
  issues closes the issue) and let the projection job refresh the snapshot.
  History lives in git either way.
- If a task requires public writes, external purchases, publishing, or another
  blocked action, add a `**Blocked**:` reason instead of attempting it.
- Commit only scoped files or hunks. Never use `git add -A`, `git add .`,
  `git reset --hard`, `git checkout --`, or `git clean -fd` in a multi-agent
  worktree.
- Commit TASKS.md claim/plan/block updates separately from implementation when
  practical, then remove the completed task in the implementation commit.

### Canonical backend-aware policy snippet

Copy this into another repo's `AGENTS.md` / `CLAUDE.md` / Cursor rules so agents
learn the backend-aware default rather than a file-only one:

```markdown
## Task Management
- Read `TASKS.md` for available work; obey any `<!-- policy: ... -->` comments.
- Determine the backend from `.tasksmd.json` (default: file backend `tasks-md`).
  - **File backend:** claim by appending `(@you)` to the task line; complete by
    removing the whole task block (history lives in git log). Best-effort.
  - **Generated backend** (`git-native` / `github-issues`): `TASKS.md` is a
    generated snapshot — never hand-edit it. Use `tasks claim <id>` /
    `tasks complete <id>` / `tasks create "<title>"` (or the `tasks-mcp` tools);
    git-native claims are collision-free with a `claimId` fencing token.
- Pick highest-priority unblocked task (P0→P3); skip others' claims and blocked tasks.
```

### Downstream drift (outside this repo)

Operators have copied the older **file-only** snippet into other repos. Replace it
with the snippet above wherever it appears. The exact file-backend-only phrasings to
find-and-replace — "Claim tasks by appending `(@agent)`" / "edit `TASKS.md` directly" — appear at these locations: <!-- drift-allow: names the banned phrasings to replace -->

- `~/.config/agentbrew/` shared rules and `global_rules.md` "TASKS.md Format" /
  "Task Backend Configuration" sections.
- Any downstream repo `AGENTS.md` / `CLAUDE.md` whose Task-Management section
  predates the backend split.

These live outside this repo, so they are recorded here rather than edited; a
maintainer (or an `agentbrew sync`) propagates the backend-aware snippet.
