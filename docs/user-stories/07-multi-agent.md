# User Story: Multi-Agent Coordination

> As a team running multiple agents, I want them to work in parallel without duplicating effort or stepping on each other.

## How Claiming Works

An agent claims a task by appending its identity to the task line:

```markdown
- [ ] Add rate limiting to public API endpoints (@cursor-1)
```

Other agents see the claim and skip to the next unclaimed task. On completion, the agent removes the entire task block.

## Agent Identity

The recommended format is `@<tool>-<instance>`:

| Example | Meaning |
|---------|---------|
| `@claude-code` | Claude Code CLI |
| `@codex` | OpenAI Codex CLI |
| `@cursor-1` | Cursor, window 1 |
| `@gemini` | Gemini CLI |
| `@cascade-bg` | Windsurf Cascade, background |
| `@copilot-agent` | GitHub Copilot coding agent |
| `@pipeline-a1b2` | Orchestrator pipeline |

Instance numbers distinguish concurrent sessions of the same tool.

## Commit and Push Claims

In multi-agent setups, the agent should commit and push the claim **immediately** — before starting work:

```bash
git add TASKS.md
git commit -m "chore: claim rate-limiting task (@cursor-1)"
git push
```

An unpushed claim protects nothing. Other agents won't see it until it's pushed.

In single-agent setups, the claim can be combined with the work commit — there's no one to race against.

## Stale Claims

A claim becomes stale when the claiming agent crashes or its session ends before completing the task. Two recovery paths:

### Same agent restarts

The `/next-task` command checks for prior claims with your `(@agent-id)`. If found, it resumes the work instead of claiming a new task. This is the common case — handled automatically.

### Different agent encounters a stale claim

1. Check `git log` for recent commits by the claiming agent
2. If no commits referencing that agent's work in the last 30 minutes, the claim is likely stale
3. **Ask the user before reclaiming** — never silently steal another agent's task
4. To reclaim: replace `(@old-agent)` with `(@your-agent-id)`

## Race Conditions

Claiming is best-effort, not a distributed lock. Two agents can theoretically race to claim the same task if they read the file simultaneously.

In practice this is rare:
- The claim window is a single git commit
- Agents work on different timescales
- Git merge will conflict on the same line, forcing one agent to re-pick

For stronger guarantees, use the [MCP server](08-mcp-server.md) as the coordination backend.

## Parallel Workflow

```
Agent A                     Agent B                     TASKS.md
─────────                   ─────────                   ────────
Read TASKS.md                                           P0: auth-fix
                            Read TASKS.md               P1: rate-limit, pagination
Claim auth-fix              
Push claim                                              P0: auth-fix (@agent-a)
                            Read (sees claim)           P1: rate-limit, pagination
                            Claim rate-limit
                            Push claim                  P1: rate-limit (@agent-b), pagination
Work on auth-fix            Work on rate-limit
Complete, remove, push                                  P1: rate-limit (@agent-b), pagination
                            Complete, remove, push      P1: pagination
Pick pagination                                         P1: pagination (@agent-a)
```

Each agent claims a unique task. Git auto-merges deletions on non-adjacent lines. Conflicts are rare and trivial.

## Tag-Based Specialization

Declare agent capabilities in AGENTS.md:

```markdown
## Agents
- @backend-agent: tags backend, database, infra
- @frontend-agent: tags frontend, ux
- @docs-agent: tags docs
```

Agents prefer tasks matching their tags but can pick untagged tasks or tasks outside their specialty if nothing else is available. Tags are a soft preference, not a hard filter.
