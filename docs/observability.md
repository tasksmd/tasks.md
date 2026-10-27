# Observability

How to see what the tasks.md tools did, what failed, and whether an install is
healthy. Everything stays on your machine unless the owner of a machine sets a
PostHog key: then anonymous usage counts are sent (see Field telemetry).

## Logs

Every `tasks` command logs one `cli` `run` event (the command path, ok, time).
The long-running parts log more: `tasks watch`, the `tasks-mcp` server, and
git-native claim operations (`tasks claim`, `heartbeat`, `unclaim`, `complete`,
`cancel`, `update`).

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
| `component` | `cli`, `watch`, `mcp`, or `claims` |
| `event` | `run` (cli); `lint` (watch); the tool name (mcp); the operation (claims) |
| `ok` | `true` when the operation did what was asked |
| `code` | the command path (cli, e.g. `fleet:init`); else an outcome code: `claimed`, `already_claimed`, `conflict`, `ok`, `tool_error`, `exception`, … |
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
reporter. The only data exit is the opt-in field telemetry below.

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

## Field telemetry

Opt-in anonymous usage counts, so the README Proof section can show real use.
The adapter is `packages/cli/src/telemetry.ts`, the only module that talks to
PostHog.

- **What leaves:** the allow-listed event fields only (`v`, `component`, `ok`,
  `story`, `ms`, `count`, `code`), the event name, its time, the app version,
  and a random install id. Never task text, IDs, names, hosts, or paths.
  Person profiles and GeoIP are off (`$process_person_profile: false`,
  `$geoip_disable: true`).
- **Where:** PostHog EU, `https://eu.i.posthog.com/batch/`, batched, at most once a day.
- **When:** only with a project key. The owner of a machine stores it in
  `TASKS_POSTHOG_KEY` or the macOS Keychain (service `tasks-md`, account
  `posthog_key`). No key: nothing is sent.
- **Off:** `tasks telemetry off`, or `DO_NOT_TRACK=1`. The first run in a
  terminal says so in one line.
- **Check:** `tasks telemetry status`; `tasks telemetry send --dry-run` prints
  the exact body with the key hidden.
- **State:** `telemetry.json` beside the event log (install id, cursor,
  on/off, last send). Delete it to reset.

The Proof numbers come from `node scripts/proof.mjs record`. It writes
per-machine totals to `docs/proof/metrics.json`, under a label that hashes the
install id. With `TASKS_POSTHOG_PERSONAL_KEY` and `TASKS_POSTHOG_PROJECT_ID`
set, it reads totals for all machines from PostHog's query API instead.

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
