# Tasks
Spec v0.5

## P1

- [ ] File an issue on agentsmd/agents.md proposing TASKS.md as a companion standard
  - **ID**: agents-md-issue
  - **Tags**: community
  - **Details**: Open an issue on https://github.com/agentsmd/agents.md referencing Issue #71
    (.agent directory proposal). Include:
    - One-paragraph pitch: TASKS.md = what to work on, AGENTS.md = how to work
    - Link to the spec and README
    - Propose adding a "See also: TASKS.md" reference in agents.md docs
  - **Acceptance**: Issue filed with clear proposal, link shared in README

- [ ] Build a tasks-mcp server that reads/writes TASKS.md
  - **ID**: mcp-server
  - **Tags**: tooling
  - **Details**: TypeScript MCP server using `@modelcontextprotocol/sdk`.
    Four tools: `list_tasks`, `claim_task`, `complete_task`, `add_task`.
    Reads/writes TASKS.md files following the spec (multi-file discovery, blocker resolution).
    Publish as `tasks-mcp` on npm.
  - **Files**: `mcp/src/index.ts`, `mcp/package.json`
  - **Acceptance**: Works with Claude Code MCP config. `list_tasks` returns structured task data
    with priority, tags, blockers. `claim_task` appends agent identity. `complete_task` removes
    the task block. `add_task` appends under the correct priority heading.

- [ ] Add a GitHub Pages site at tasksmd.com
  - **ID**: website
  - **Tags**: docs
  - **Details**: Single-page static site (plain HTML + CSS, no framework). Sections:
    - Hero: "A task queue for AI agents" + Quick Start code block
    - Why: session persistence, vendor-neutral, git-native
    - Format overview with the six metadata fields
    - Install table for agent commands
    - Link to spec, examples, GitHub repo
    Follow the agents.md site pattern. Use GitHub Pages from `docs/` folder.
  - **Files**: `docs/index.html`, `docs/style.css`
  - **Acceptance**: Site renders at the configured GitHub Pages URL.
    Mobile-responsive. All links work. No JavaScript required.

- [ ] Add concrete stale claim recovery protocol
  - **ID**: stale-claims
  - **Tags**: spec
  - **Details**: "Handle per team convention" is a cop-out for the most common real-world
    failure (agent crashes mid-task). The spec should provide a recommended default:
    - Define "stale" as: no commits by the claiming agent in the last N minutes
    - HOW to check: `git log --author=<agent> --since="30 minutes ago"` (but agents
      don't have git authors — claims are just `(@name)` annotations)
    - Alternative: timestamp-based (`(@cursor-1 2025-03-13T17:00)`)
    - Or: just document "any agent can reclaim after 30 min of no pushes to the branch"
    This is the #1 real-world multi-agent failure mode. Punting it weakens the spec.
  - **Files**: `spec.md`
  - **Acceptance**: Spec has a recommended stale claim policy. The policy is
    implementable without custom tooling (git log or file timestamps only).

- [ ] Clarify tag matching semantics for agent routing
  - **ID**: tag-semantics
  - **Tags**: spec
  - **Details**: The Tag-Based Routing section says "preferentially routed... not
    exclusively locked" but doesn't define the matching algorithm. Questions:
    - Does an agent with `tags: backend, database` skip frontend-tagged tasks or just deprioritize them?
    - Does a task with `tags: backend, auth` require an agent matching ALL tags or ANY?
    - What about tasks with no tags — available to everyone? Only to unspecialized agents?
    Propose: ANY-match (agent matches if it has at least one overlapping tag),
    untagged tasks are available to all agents, tagged tasks are preferred-not-required.
  - **Files**: `spec.md`
  - **Acceptance**: Tag matching algorithm is specified precisely enough to implement
    in the MCP server and linter.

## P2

- [ ] Specify discovery order for deterministic task selection
  - **ID**: discovery-order
  - **Tags**: spec
  - **Details**: The `find` command in agent commands returns results in filesystem order,
    which varies by OS and filesystem type. Two agents on different machines could discover
    TASKS.md files in different orders, read tasks in different orders, and pick the same
    "first unclaimed P1" from different files — increasing claim races.
    Fix: spec should recommend sorting discovered files by path (lexicographic).
    Commands should pipe find through `sort`.
  - **Files**: `spec.md`, `commands/`
  - **Acceptance**: Spec defines a deterministic discovery order. All 5 commands sort results.

- [ ] Add rebase conflict guidance for TASKS.md to commands
  - **Tags**: commands
  - **Details**: Step 5 of every command says `git pull --rebase` then `git push`, but
    TASKS.md is the most likely file to conflict — every agent modifies it (claims,
    removals, additions). The commands give no guidance on what to do when rebase fails.
    Options:
    - Add a "if rebase conflicts on TASKS.md, re-read and re-apply your removal" step
    - Or: recommend `git pull --rebase --autostash` + manual conflict resolution
    - Or: just note that TASKS.md conflicts are usually trivial (accept both deletions)
  - **Files**: `commands/`

- [ ] Explicitly forbid `[x]` on top-level tasks in the spec
  - **Tags**: spec
  - **Details**: The spec says "remove completed tasks" but never explicitly says "don't
    mark top-level tasks `[x]`." Human editors will instinctively check the box instead
    of deleting the block. The spec should state: "`[x]` is only for sub-tasks tracking
    progress on a parent. Top-level tasks are removed when done, never checked."
    The linter should flag `[x]` on top-level tasks as a warning.
  - **Files**: `spec.md`
  - **Acceptance**: Spec has an explicit rule. Examples don't show `[x]` on top-level tasks
    (already true). Linter spec updated to flag it.

- [ ] Add a validator script that checks TASKS.md format
  - **Tags**: tooling
  - **Details**: Node.js CLI script (`npx tasks-lint`). Checks:
    - `# Tasks` heading and `Spec v0.5` version line present
    - Priority headings are valid (P0–P3, in order)
    - Tasks are checkboxes (`- [ ]` or `- [x]`)
    - IDs are kebab-case and unique across all files
    - Blocked-by references point to existing IDs
    - No orphaned metadata (metadata without a parent task)
  - **Files**: `lint/index.js`, `lint/package.json`
  - **Acceptance**: Exits 0 on valid files, exits 1 with line-numbered errors on invalid files.
    Works on all files in `examples/`.

- [ ] Add examples for Python, Rust, and mobile projects
  - **Tags**: docs
  - **Details**: Three new example files showing idiomatic task queues:
    - `examples/python-api.md` — FastAPI project with pytest, mypy, ruff
    - `examples/rust-cli.md` — Cargo project with clippy, integration tests
    - `examples/mobile-app.md` — React Native with iOS/Android build tasks
  - **Files**: `examples/python-api.md`, `examples/rust-cli.md`, `examples/mobile-app.md`

- [ ] Create a GitHub Issues to TASKS.md sync script
  - **Tags**: tooling
  - **Details**: Script that reads GitHub Issues with a `tasks.md` label and generates
    TASKS.md entries. Maps issue labels to priority (P0=critical, P1=high, P2=medium, P3=low)
    and to tags. Uses `gh` CLI for API access.
  - **Files**: `scripts/sync-issues.sh`
  - **Acceptance**: Running the script produces a valid TASKS.md from labeled issues.

## P3

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Tags**: community
  - **Details**: Lead with session persistence, not multi-agent. Structure:
    - The problem: tasks get lost between sessions, each tool invents its own format
    - The AGENTS.md parallel: instructions vs. work queue
    - How TASKS.md solves it: persistent, git-native, vendor-neutral
    - Show a before/after: chat-driven vs. queue-driven agent workflow
    Target: dev.to or personal blog, cross-post to HN
