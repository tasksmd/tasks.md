# Contributing to TASKS.md

Thanks for your interest in TASKS.md. This repo defines the TASKS.md format
and ships a small set of tools (`parser`, `lint`, `mcp`, `cli`) that make
the format useful for humans and AI agents.

This is a small personal open-source project. Contributions of all sizes
are welcome — typo fixes, new examples, bug reports, and feature proposals.

## Code of Conduct

Everyone interacting in this project is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Quick start

```bash
git clone https://github.com/tasksmd/tasks.md.git
cd tasks.md
npm install
npm run build
npm test
```

This is an npm workspace with four packages under `packages/`:

| Package             | Purpose                                             |
|---------------------|-----------------------------------------------------|
| `@tasks-md/parser`  | Parse TASKS.md files into structured tasks          |
| `@tasks-md/lint`    | Validate TASKS.md files against the spec            |
| `@tasks-md/cli`     | `tasks` command for everyday queue management       |
| `tasks-mcp`         | MCP server exposing TASKS.md to AI agents           |

The canonical format lives in [`spec.md`](spec.md); examples live in
[`examples/`](examples/).

## The verify gate

Before you open a PR, run:

```bash
npm run build
npm test
npm run lint
npx -y @tasks-md/lint TASKS.md
```

These four commands are what CI runs on every PR. If they pass locally, CI
should pass too. For docs-only changes, `npm run lint` plus the last command
are usually enough.

When you touch the static site, also run:

```bash
npm run build:site
```

## Finding something to work on

Open tasks for this repo live in [`TASKS.md`](TASKS.md). Look for a `## P0`
or `## P1` item without a `**Blocked**:` line and without another agent's
claim trailer (`(@someone)`). Claim it by appending `(@your-handle)` to the
task line in a small separate commit, then implement it.

Tasks follow the format defined in [`spec.md`](spec.md). If you're unsure
which priority a task should be, P2 is a safe default.

## Pull requests

1. Fork the repo and branch off `main` (`fix/...`, `feat/...`, or
   `docs/...` are all fine).
2. Keep commits scoped. Staging with `git add <specific-files>` is safer
   than `git add -A` when other work is in flight.
3. Write a PR description that explains *why* the change is needed, not
   just *what* changed.
4. If you used an AI coding agent to write any part of the change, say
   so in the PR body. "Written with an AI agent, reviewed by me before
   pushing" is enough.
5. CI runs the verify gate from above; fix any failures before asking for
   review.

Small, focused PRs get reviewed faster than large ones. When in doubt,
split.

## Reporting bugs and proposing features

Open a [GitHub issue](https://github.com/tasksmd/tasks.md/issues) describing:

- What you expected to happen
- What actually happened
- Minimal steps to reproduce (for bugs) or a concrete use case (for
  features)

For format-level proposals, please read [`spec.md`](spec.md) first and
reference the relevant section.

## License and attribution

By contributing, you agree that your contributions will be licensed under
the [MIT License](LICENSE) of this project. You retain copyright on your
contributions.

Please do not include proprietary code or documentation from any employer
or other third party in contributions to this repo.
