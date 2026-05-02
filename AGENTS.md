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
- `taskgrind/` contains the autonomous-grind prompt template and enforcement
  scripts adopted by downstream repos.

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
+-- taskgrind/                      # Long-running autonomous session guardrails
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

Any change to `/next-task` behavior must be applied in the same commit to:

- `commands/next-task.md`
- `commands/claude/skills/next-task/SKILL.md`
- `commands/codex/skills/next-task/SKILL.md`
- `commands/cursor/next-task.md`
- `commands/devin/skills/next-task/SKILL.md`
- `commands/gemini/next-task.toml`
- `commands/windsurf/next-task.md`
- `README.md` "What it does" step list
- `examples/complex-tasks.md` when the change illustrates a format feature

Any change to `/lint-tasks` behavior must be applied in the same commit to:

- `commands/lint-tasks.md`
- `commands/claude/skills/lint-tasks/SKILL.md`
- `commands/codex/skills/lint-tasks/SKILL.md`
- `commands/cursor/lint-tasks.md`
- `commands/devin/skills/lint-tasks/SKILL.md`
- `commands/gemini/lint-tasks.toml`
- `commands/windsurf/lint-tasks.md`
- `commands/README.md` and `README.md` when user-facing behavior changes

After changing a repeated term or command step, run a targeted search such as:

```bash
grep -r "<changed-term>" commands/ examples/ taskgrind/ README.md spec.md
```

### Spec Propagation

- A metadata field change in `spec.md` must update README examples, affected
  examples, parser/linter behavior, MCP/CLI docs, and every command that reads
  or writes that field.
- A new workflow step must update README's "What it does" list and every
  `/next-task` variant.
- Examples must remain valid and should demonstrate new format features when
  they would help agents learn the pattern.

### Taskgrind Propagation

Scripts in `taskgrind/scripts/` are canonical for adopting repos. For behavior
or interface changes, update the script header comment and `taskgrind/README.md`
with adoption notes. Pure bug fixes can say that no downstream action is needed.

Changes to `taskgrind/prompt-template.md` hard rules are policy changes. Update
the corresponding enforcement script when applicable and document the concrete
failure mode in `taskgrind/README.md`.

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

- Read `TASKS.md` before starting work and obey any `<!-- policy: ... -->`
  comments.
- Claim tasks by appending your agent identity, for example `(@devin-session-17)`.
- For complex tasks, add a `**Plan**:` checklist before implementation and commit
  that planning hunk.
- Do not mark completed tasks `[x]`; remove the entire task block, including all
  metadata and plan lines. History lives in git.
- If a task requires public writes, external purchases, publishing, or another
  blocked action, add a `**Blocked**:` reason instead of attempting it.
- Commit only scoped files or hunks. Never use `git add -A`, `git add .`,
  `git reset --hard`, `git checkout --`, or `git clean -fd` in a multi-agent
  worktree.
- Commit TASKS.md claim/plan/block updates separately from implementation when
  practical, then remove the completed task in the implementation commit.
