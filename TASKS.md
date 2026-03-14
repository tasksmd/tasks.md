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

## P2

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



- [ ] Add CI workflow for example validation
  - **ID**: ci-validation
  - **Tags**: tooling
  - **Details**: No `.github/workflows/` exists. Add a basic CI that validates:
    - All `examples/*.md` files start with `# Tasks` + `Spec v0.5`
    - Priority headings are in order (P0–P3)
    - Tasks use `- [ ]` checkbox format
    - No `[x]` on top-level tasks
    This can be a simple shell script until the full `tasks-lint` validator (P2 task) is built.
    Also validates that README example code blocks match the spec format.
  - **Files**: `.github/workflows/ci.yml`
  - **Acceptance**: CI runs on push/PR, catches malformed examples

## P3

- [ ] Write a blog post: "Why your AI agent needs a backlog"
  - **Tags**: community
  - **Details**: Lead with session persistence, not multi-agent. Structure:
    - The problem: tasks get lost between sessions, each tool invents its own format
    - The AGENTS.md parallel: instructions vs. work queue
    - How TASKS.md solves it: persistent, git-native, vendor-neutral
    - Show a before/after: chat-driven vs. queue-driven agent workflow
    Target: dev.to or personal blog, cross-post to HN
