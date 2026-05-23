# Architecture

> Spec-first design. The format ([`spec.md`](spec.md)) is canonical; everything else is a reference implementation.

This file is the root-level architecture summary that the `load-project-context` rule expects. See [`AGENTS.md`](AGENTS.md) for editing rules and the per-package READMEs for implementation detail.

## Layered structure

```
   ┌──────────────────────────────────────────────────────────────┐
   │ spec.md  +  examples/  +  commands/{next-task,lint-tasks}.md │
   │                  THE SPEC — canonical                         │
   └──────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
   ┌────────────────┐ ┌──────────────┐ ┌────────────────┐
   │ @tasks-md/     │ │ tasks-mcp    │ │ @tasks-md/cli  │
   │   parser       │ │              │ │  (`tasks` bin) │
   │ @tasks-md/lint │ │ MCP server   │ │                │
   └────────────────┘ └──────────────┘ └────────────────┘
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │       commands/{claude,codex,cursor,devin,gemini,windsurf}/   │
   │       (regenerated from canonical sources by `tasks           │
   │       generate-commands` — never hand-edit)                   │
   └──────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Path | Role |
|---|---|---|
| `@tasks-md/parser` | [`packages/parser/`](packages/parser/) | Parse a TASKS.md file into a typed tree: sections, tasks, metadata (`**ID**`, `**Tags**`, `**Details**`, `**Files**`, `**Acceptance**`, `**Blocked by**`), claim suffixes, policy comments, sub-tasks. Zero runtime dependencies. |
| `@tasks-md/lint` | [`packages/lint/`](packages/lint/) | Validate a TASKS.md against the spec. Ships the `tasks-lint` binary. Used by every agent's `/lint-tasks` skill plus CI in repos that adopt it. |
| `tasks-mcp` | [`packages/mcp/`](packages/mcp/) | Model Context Protocol server. Exposes TASKS.md operations (list, claim, complete, search) as MCP tools that any MCP-aware agent can call. |
| `@tasks-md/cli` | [`packages/cli/`](packages/cli/) | The `tasks` CLI binary. Local equivalent of `tasks-mcp` operations — search, list, claim, complete — plus `tasks generate-commands` for cross-agent variant regeneration. |

All four are TypeScript strict-ESM, Node 18+. The workspace at the repo root coordinates them via npm workspaces.

## Cross-agent command generation

Every `/next-task` and `/lint-tasks` invocation in every supported agent comes from the same two canonical markdown files:

| Canonical source | Regenerated variants |
|---|---|
| [`commands/next-task.md`](commands/next-task.md) | `commands/claude/skills/next-task/SKILL.md`, `commands/codex/skills/next-task/SKILL.md`, `commands/cursor/next-task.md`, `commands/devin/skills/next-task/SKILL.md`, `commands/gemini/next-task.toml`, `commands/windsurf/next-task.md` |
| [`commands/lint-tasks.md`](commands/lint-tasks.md) | Same six per-agent variants for `/lint-tasks` |

Run `npx tasks generate-commands` after editing a canonical source. The `commands-drift` CI job rejects any PR where a generated variant diverges.

## Data flow — single task pickup

```
agent /next-task                                          ↓
                ┌── reads TASKS.md (lib: @tasks-md/parser)  ↓
                │                                           ↓
                ├── filters: P0 → P1 → P2 → P3,             ↓
                │   blocked-by satisfied,                   ↓
                │   not already claimed                     ↓
                │                                           ↓
                ├── writes draft plan (if non-trivial)      ↓
                │   to docs/plans/<task-id>.md              ↓
                │   from docs/templates/plan-template.md    ↓
                │                                           ↓
                ├── claims by appending (@agent-id)         ↓
                │                                           ↓
                └── implements + removes task entirely      ↓
                    in the same commit                      ↓
```

The same flow runs whether the agent invokes `tasks-mcp` (MCP path), the `tasks` CLI (subprocess path), or just reads the file directly (parser-library path).

## Verification

| Surface | Gate |
|---|---|
| TASKS.md edits | `npm run lint` + `npx -y @tasks-md/lint TASKS.md` |
| Spec / parser / lint / MCP / CLI changes | `npm run build` + `npm test` + lint |
| README / website changes | `npm run build:site` |

See [`AGENTS.md` § "Verification Gate"](AGENTS.md#verification-gate) for the full per-change matrix.

## Where to read next

| You're here to… | Read |
|---|---|
| Understand the format | [`spec.md`](spec.md) + [`examples/`](examples/) |
| Pick a task | [`TASKS.md`](TASKS.md) + [`commands/next-task.md`](commands/next-task.md) |
| Validate a TASKS.md | `packages/lint/README.md` |
| Wire MCP to your agent | `packages/mcp/README.md` |
| Add a new agent variant | [`AGENTS.md` § "Canonical Source Boundaries"](AGENTS.md#canonical-source-boundaries) |
| Plan your work | [`docs/templates/plan-template.md`](docs/templates/plan-template.md) |
