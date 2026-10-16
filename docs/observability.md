# Observability

How to see what the tasks.md tools did, what failed, and whether an install is
healthy. Everything stays on your machine: nothing is sent to a service.

## Logs

Only the long-running parts log: `tasks watch`, the `tasks-mcp` server, and
git-native claim operations (`tasks claim`, `heartbeat`, `unclaim`, `complete`,
`cancel`, `update`). Short commands print their result and exit, so a log
would add nothing.

| Setting | Value |
|---|---|
| File | `$TASKS_EVENTS_FILE`, else `$XDG_STATE_HOME/tasks-md/events.jsonl`, else `~/.local/state/tasks-md/events.jsonl` |
| Format | one JSON object per line (JSONL) |
| Size | rotates to `events.jsonl.1` past 1 MB; one old file is kept |
| Turn off | `TASKS_EVENTS=0` |

Each event is **content-free**: codes, counts, and timings only. It never holds
task titles, bodies, IDs, owner names, paths, or error messages. Every string
field must match `^[a-z0-9_.:-]{1,40}$`; an event that would break this is
dropped, not written.

| Field | Meaning |
|---|---|
| `ts` | ISO time |
| `v` | schema version (`1`) |
| `component` | `watch`, `mcp`, or `claims` |
| `event` | `lint` (watch); the tool name (mcp); the operation (claims) |
| `ok` | `true` when the operation did what was asked |
| `code` | outcome code: `claimed`, `already_claimed`, `conflict`, `ok`, `tool_error`, `exception`, … |
| `ms` | how long it took |
| `count` | lint errors found (watch only) |
| `story` | the user story this event serves (see Errors) |

Read it with `jq`:

```bash
jq -c 'select(.ok == false)' ~/.local/state/tasks-md/events.jsonl | tail -20
```

### Per-story outcome rate

Stories US03, US04, US05, and US07 use the share of failed events as their
metric. For one story:

```bash
jq -s --arg s US04 '[.[] | select(.story == $s)] | {calls: length, failed: (map(select(.ok | not)) | length)}' \
  ~/.local/state/tasks-md/events.jsonl
```

The log is per machine and never leaves it, so each user reads their own rate.

The writers are `packages/cli/src/events.ts` and its twin
`packages/mcp/src/events.ts`. A test keeps the two identical.

## Errors

Errors are captured locally, in the log above. There is no external error
reporter: a local CLI and an MCP server never phone home.

Each event names the user story it serves, so an error points at the story it
breaks:

| Source | Story |
|---|---|
| `tasks watch` lint runs | [US01 Agents know what to work on](user-stories/01-agents-know-what-to-work-on.md) |
| git-native claims (`claim`, `heartbeat`, `unclaim`, `complete`, `cancel`, `update`) | [US03 Agents work through the queue](user-stories/03-agents-work-through-queue.md) |
| MCP `claim_task`, `unclaim_task`, `complete_task` | US03 |
| MCP `pick_task` | [US04 Agents work in the right order](user-stories/04-agents-work-in-right-order.md) |
| MCP `list_tasks` | [US07 Monitor queue health](user-stories/07-monitor-queue-health.md) |
| MCP `add_task` | [US02 Tasks agents complete without asking](user-stories/02-tasks-agents-complete-without-asking.md) |
| MCP `enrich_task` | [US08 Rich task metadata](user-stories/08-rich-task-metadata.md) |
| MCP `find_next_task_across_workspaces` | [US05 Separate queues per member](user-stories/05-separate-queues-per-member.md) |

A test fails when a new MCP tool has no story.

To report a bug, attach the failing lines (`ok: false`) from the log. They
hold no task content, so they are safe to paste.

## Health check

`tasks doctor` is the health check. It prints one line per check: `✓` ok,
`⚠` warn, `✗` fail. Every `⚠` and `✗` line is followed by `fix:` and the
command that fixes it. The exit code is nonzero only on a `✗`.

```text
✓ backend config: backend = tasks-md (default; no .tasksmd.json)
⚠ agent commands: no agent command dirs
  fix: tasks install --agent <claude|codex|cursor|gemini>
```

`tasks init --install` and `bash scripts/setup.sh` end with it. The source is
`runDoctor` in `packages/cli/src/commands/fleet.ts`.

## Metrics

Project metrics (adoption, downloads, gate speed) live in
[metrics.md](metrics.md).
