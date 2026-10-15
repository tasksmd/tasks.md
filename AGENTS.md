# AGENTS.md - tasks.md guide for agents

## Start here

`tasks.md` defines the TASKS.md task-queue spec (`spec.md`) and ships the tools
around it: `packages/parser`, `packages/lint`, `packages/mcp`, `packages/cli`,
plus the shared agent commands (`/next-task`, `/lint-tasks`, `/review-tasks`, …) in `commands/`. The
canonical repo is `github.com/tasksmd/tasks.md`, branch `main`. It is public.

Read this file first. Then open only the doc that the routing table names. Do
not read `README.md` end to end; it is the user landing page. `CLAUDE.md` is a
symlink to this file. The docs map is [`docs/README.md`](docs/README.md).

## Commands

An npm workspace repo. Run commands from the repo root.

| Task | Command |
|---|---|
| Install | `npm ci` |
| Type-check and build every package | `npm run build` |
| All tests | `npm test` |
| One package's tests | `npm test -w packages/<name>` |
| Lint TASKS.md, docs drift, counts, docs contract | `npm run lint` |
| Rebuild the website | `npm run build:site` |
| Regenerate agent command files | `node packages/cli/dist/cli.js generate-commands` |
| Run the local CLI | `node packages/cli/dist/cli.js <command>` (after `npm run build`) |

### Verification gate

- Docs-only or TASKS.md edits: `npm run lint`.
- Spec, parser, lint, MCP, CLI, or command behavior: `npm run build`, `npm test`, `npm run lint`.
- README or website changes: add `npm run build:site` when rendered output can change.

Do not claim work is complete until those commands pass.

## Where to change what

| I want to… | Change | Update this doc too |
|---|---|---|
| Change the format | `spec.md` | README examples, `examples/`, parser, lint, MCP and CLI docs ([rules](docs/editing-rules.md#spec-propagation)) |
| Change parsing | `packages/parser/src/` | `packages/parser/README.md` |
| Add or change a lint rule | `packages/lint/src/` | `packages/lint/README.md` |
| Change an MCP tool | `packages/mcp/src/` | `packages/mcp/README.md` |
| Change a CLI command | `packages/cli/src/` | `packages/cli/README.md`, README |
| Change a shared command (`/next-task`, `/lint-tasks`, `/review-tasks`, …) | `commands/<name>.md`, then regenerate | README, `commands/README.md` |
| Add an agent variant | the command generator in `packages/cli/` | [ARCHITECTURE.md](ARCHITECTURE.md#cross-agent-command-generation) |
| Change the website | `docs/template.html`, `scripts/build-site.js` | none (`docs/index.html` is generated) |
| Change CI or release | `.github/workflows/`, `scripts/sync-versions.sh` | [docs/release-and-ci.md](docs/release-and-ci.md) |
| Add or change an example | `examples/` (must stay valid TASKS.md) | README if it shows a new feature |
| Add a top-level doc | `docs/<name>.md` | a row in [docs/README.md](docs/README.md) |

## Rules

Full text: [docs/editing-rules.md](docs/editing-rules.md).

1. TypeScript packages are strict ESM for Node.js 18+.
2. Markdown examples stay valid TASKS.md: `# Tasks`, `## P0`–`## P3`, checkbox tasks, indented bold metadata. Fence code with a language tag.
3. Prefer small, obvious APIs. Merge overlapping tools or flags instead of adding new ones.
4. Publishing (`npm publish`, releases, PRs, pushes) needs explicit current-session operator approval.
5. Never bypass hooks with `--no-verify`.
6. Commit only scoped files. Never `git add -A`, `git add .`, `git reset --hard`, or `git clean -fd`.

### Canonical source boundaries

Root docs and `commands/` sources are the truth. Installed copies in agent config
directories are generated mirrors; never edit them. Edit only the canonical
`commands/<name>.md` sources, then regenerate every variant. Windsurf and Devin support was removed; Augment is frozen. Details:
[docs/editing-rules.md](docs/editing-rules.md#canonical-source-boundaries).

### Task queue

This repo runs the git-native backend. `TASKS.md` is a generated snapshot; never
hand-edit it. Pick with `tasks list` / `tasks pick`, claim with `tasks claim <id>`
(it returns a `claimId`), file with `tasks create "<title>"`, finish with
`tasks complete <id>`. Non-trivial tasks need a plan in `docs/plans/<task-id>.md`.
Full policy: [docs/editing-rules.md](docs/editing-rules.md#task-queue-policy).

## Gotchas

- `TASKS.md` here is generated from the `tasks-claims` ref. Edits to the file are lost; use the CLI.
- The claim check is armed (`TASKS_CLAIM_ENFORCE=1`, required check). A PR that changes non-Markdown files needs `Task: <id>` and `Task-Claim: <claimId>` trailers as the last paragraph of a commit. `tasks claim` pushes the `tasks-claims` ref itself.
- Set `TASKS_ACTOR=<your-name>` before `tasks create` or `tasks claim`, so the log names you.
- Inside this repo, `npx @tasks-md/cli` resolves the unbuilt local package. Run `npm run build`, then `node packages/cli/dist/cli.js`.
- The CI `commands-drift` job fails if you edit a generated command variant by hand.
- The owner's global gitignore lists `TASKS.md`. Fixture git repos in tests need `GIT_CONFIG_GLOBAL=/dev/null`.
- In the agent sandbox, git push, ssh, and `npm ci` network access can fail. Run them outside the sandbox.
- CI may install through a lagging registry mirror. Release, OIDC, and ruleset traps: [docs/release-and-ci.md](docs/release-and-ci.md).

## Delivery

1. Claim a task, then branch `type/short-description` from `main` in a worktree.
2. Make the change with its tests and its docs.
3. Run the verification gate above.
4. Commit with a conventional header. Put the `Task:` and `Task-Claim:` trailers last.
5. Push and open a PR. The body has `## Summary`, `## Details`, `## Docs`, and `## Visual proof` (a pasted terminal transcript).
6. Wait for every CI check, squash-merge, then `tasks complete <id>`. Remove the worktree and branch.

## Docs upkeep

- Every behavior change updates its docs in the same PR. The routing table names the doc.
- A gotcha that cost you time goes into `## Gotchas` in the same PR, or becomes a check.
- Every PR body has a `## Docs` section: the docs you changed, or `Docs: none — <reason>`.
- A new top-level `docs/*.md` file needs a row in [docs/README.md](docs/README.md). `npm run lint` runs `scripts/check-docs-contract.mjs`, which checks this file's sections and size, the docs map, and the README opening.
- The contract: agentbrew `docs/agent-guide-baseline.md`.
