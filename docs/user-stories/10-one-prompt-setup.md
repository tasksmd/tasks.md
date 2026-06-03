# 10. One-prompt setup

> **I am a developer and I want to tell my agent to use tasks.md in my repo — in one step.**

Adoption should cost one prompt, not a nine-command walkthrough. The developer pastes a single block into whatever agent they already use, and the agent does the entire setup end to end — no CLI knowledge required.

## What the developer does

Paste the prompt from the [README Quick Start](../../README.md#one-prompt-recommended) into their agent:

```text
Set up tasks.md in this repo. Create TASKS.md if missing, add the "## Task Management"
section to AGENTS.md (don't duplicate it), install the /next-task command for yourself,
then verify with `npx -y @tasks-md/lint TASKS.md` and tell me what you did. If npx/Node
isn't available, write the files directly from https://github.com/tasksmd/tasks.md.
```

## What the agent does

The agent follows the canonical [`commands/setup.md`](../../commands/setup.md) workflow — which ships pre-generated as a `/setup` command for Claude Code, Codex, Cursor, Devin, Gemini CLI, and Windsurf, so the steps are identical across agents (VISION G2):

1. **Confirm the repo root** (`git rev-parse --show-toplevel`).
2. **Create `TASKS.md`** if missing (never overwrite an existing one).
3. **Merge** the `## Task Management` section into `AGENTS.md` — exactly once.
4. **Install its own command.** With Node: `tasks install --agent <self>` (force-installs even if the agent's config dir doesn't exist yet). Without Node: write the command file directly.
5. **Verify**: `npx -y @tasks-md/lint TASKS.md` exits 0, `AGENTS.md` has exactly one `## Task Management` section, the command file exists.
6. **Report** what it did.

## Why it's safe to re-run

Every step is idempotent — `tasks init` merges rather than clobbers, `tasks install --agent` is a no-op when already installed, and the `AGENTS.md` section is never duplicated. Re-pasting the prompt converges to the same state.

## Node-optional

The CLI path (`tasks init` + `tasks install --agent <self>`) is preferred when `npx`/Node is available. When it isn't, the prompt instructs the agent to write `TASKS.md`, the `AGENTS.md` section, and its command file directly from the spec — the format is plain markdown with no tooling dependency.

## GitHub-repo extras (optional)

The agent can offer to add the reusable lint CI workflow (`.github/workflows/tasks-lint.yml`) and, for a **fleet** (a team of machines each running parallel agents on one queue), `tasks fleet init` to switch to the collision-free [git-native backend](../../spec.md#fleet-coordination).

## Related

- [`commands/setup.md`](../../commands/setup.md) — canonical setup workflow (generated per agent)
- [Story 01](01-agents-know-what-to-work-on.md) — `tasks init` scaffolding
- [Story 03](03-agents-work-through-queue.md) — `tasks install` auto-detect
