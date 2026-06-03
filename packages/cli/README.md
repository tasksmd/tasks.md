# @tasks-md/cli

[![npm](https://img.shields.io/npm/v/@tasks-md/cli)](https://www.npmjs.com/package/@tasks-md/cli)

Unified CLI for [TASKS.md](https://github.com/tasksmd/tasks.md) task queue management — pick tasks, sync from issue trackers, watch + auto-fix, and monitor queue health.

## Install

```bash
npm install -g @tasks-md/cli
```

Or run any subcommand directly with npx:

```bash
npx -y @tasks-md/cli pick
```

## Use

```bash
tasks init                            # scaffold TASKS.md + AGENTS.md task section
tasks install                         # install /next-task for detected agents
tasks pick                            # pick the highest-priority unblocked task
tasks list --unclaimed --unblocked    # enumerate pickable work
tasks stats                           # queue overview + throughput from git log
tasks diff                            # what changed since HEAD
tasks watch --fix                     # auto-lint TASKS.md on save
tasks sync github --merge             # sync GitHub Issues into TASKS.md
```

`tasks pick` is the read-only counterpart of `/next-task` — same priority sort, blocker resolution, and `standing-loop` skip — but it makes no claim, no commit, and no file edit. See [the user stories](../../docs/user-stories/) for runnable walkthroughs of every command.

## API

| Command | Flags | What it does |
|---------|-------|--------------|
| `init` | `--install` | Scaffold TASKS.md with P0–P3 headings and add the Task Management section to AGENTS.md |
| `install` | `--all`, `--agent <name>`, `--hooks` | Install the `/next-task` command for detected agents (Claude Code, Codex, Cursor, Devin, Gemini CLI, Windsurf). Auto-detects unless `--all` |
| `generate-commands` | — | Regenerate every agent variant from `commands/next-task.md` and `commands/lint-tasks.md`. Run after editing a canonical source |
| `pick` | `--tags <a,b>`, `--json` | Pick the highest-priority unblocked, unclaimed task. `--tags` is a soft preference. `--json` emits `{picked: false}` or `{picked, summary, priority, file, line, metadata, candidates, unblocks}` |
| `list` | `--priority <P0..P3>`, `--tag <t>`, `--unclaimed`, `--unblocked`, `--json` | Enumerate every task that matches. Default output is `<priority>\t<id>\t<summary>` per line; `--json` returns `{id, summary, priority, tags, blocked, claimed, file, line}` records |
| `stats` | `--json` | Queue overview by priority + throughput counted from `git log` |
| `diff` | `[<ref>]`, `--json` | Show TASKS.md changes since the given git ref (default `HEAD`) |
| `watch` | `[<dir>]`, `--fix` | Watch TASKS.md and auto-lint on save. `--fix` reuses `tasks-lint --fix` to remove `[x]` completed tasks |
| `sync <provider>` | provider-specific (below) | Sync issues from `github`, `jira`, or `linear` into TASKS.md |
| `migrate` | `--apply` | Import the file-backend `TASKS.md` into a git-native event log (dry-run unless `--apply`; preserves ids; rollback documented in the output) |
| `fleet init` | `--backend`, `--agent`, `--all` | Idempotent one-prompt fleet install: writes `.tasksmd.json`, `lefthook.yml`, the projection workflow, installs agent commands, and prints ruleset guidance |
| `fleet stats` | — | Contention metrics for the git-native `tasks-claims` log (events by type, open/claimed/done, stale leases, reclaim count, contention ratio vs the 20% Phase-4 tripwire) |
| `fleet compact` | — | Rewrite the `tasks-claims` log to a fold-equivalent minimum (drops terminal tasks; preserves open-task state). Single-writer maintenance |
| `doctor` | `--quiet` | Verify the fleet install — backend config, agent commands, lefthook, claims ref, projection workflow, stale leases, compaction, enforcement level. Exits nonzero on a hard failure |
| `check-push <paths...>` | `--task`, `--claim` | Path-scoped claim gate: allows doc-only pushes, requires a live claim + matching `Task-Claim` token for code (incl. code under `docs/`). The shared primitive behind the client hook, the CI required check, and the `pre-receive` recipe |

### Task operations (backend-neutral)

These run against the active backend (`tasks-md`, `github-issues`, or `git-native`; see [`spec.md` § Task backends](../../spec.md#task-backends)). `--backend <kind>` overrides per-invocation; `--as <actor>` sets the claim identity (default `$TASKS_ACTOR`); `--json` emits a structured result so generated agent commands never parse prose. An operation a backend cannot perform returns a typed `unsupported` result and a nonzero exit code rather than pretending to succeed.

| Command | Flags | What it does |
|---------|-------|--------------|
| `create <title>` | `--priority`, `--body`, `--tag`, `--as`, `--json` | File a new task |
| `update <id>` | `--title`, `--priority`, `--body`, `--tag`, `--as`, `--json` | Update a task's fields (file backend is human-editable → `unsupported`) |
| `claim <id>` | `--as`, `--json` | Claim a task. Best-effort on the file backend; collision-free (with a `claimId` fencing token) on git-native |
| `unclaim <id>` | `--as`, `--json` | Release a claimed task back to the queue |
| `complete <id>` | `--as`, `--json` | Complete a task (remove the block / close the issue / append a `completed` event) |
| `cancel <id>` | `--as`, `--json` | Drop a task without completing the work |
| `render` | `--json` | Print the human-readable `TASKS.md` snapshot from the backend (the file itself for `tasks-md`; the folded log for git-native) |

`tasks sync <provider>` is the canonical sync surface. The legacy `sync-issues`, `sync-jira`, and `sync-linear` commands still work but print a deprecation warning the first time you call them.

```bash
tasks sync github [--repo OWNER/REPO] [--label LABEL] [--output FILE] [--merge]
tasks sync jira [--project KEY] [--jql QUERY] [--output FILE] [--merge] [--max N]
tasks sync linear --team KEY [--project NAME] [--filter JSON] [--output FILE] [--merge] [--max N]
```

GitHub label → priority: `critical|p0` → P0, `high|p1` → P1, `medium|p2` → P2 (default), `low|p3` → P3 (highest-priority label wins). Jira priority name → priority: `Highest|Blocker|Critical` → P0, `High` → P1, `Medium` → P2 (default), `Low|Lowest` → P3. Linear numeric priority → priority: `1` → P0, `2` → P1, `3` → P2, `4|0` → P3. IDs use the `issue-`, `jira-PROJ-`, or `linear-TEAM-` prefix so `--merge` can identify previously synced tasks. See [Story 06](../../docs/user-stories/06-issue-tracker-flows-to-agents.md) for the full walkthrough.

`--json` returns the same shape across `pick`, `list`, `stats`, and `diff`. The library API exports the same functions for programmatic use:

```ts
import { loadAllTasks, pickBestTask, listTasks, getQueueStats, getQueueDiff } from "@tasks-md/cli";

const taskFiles = loadAllTasks(process.cwd());
const best = pickBestTask(taskFiles);
const tasks = listTasks(taskFiles, { unclaimedOnly: true, unblockedOnly: true });
```

Linting lives in [`@tasks-md/lint`](../lint/), not in the CLI — there is exactly one canonical lint surface. `tasks watch --fix` calls into the same `lintFiles` backend internally.

## See also

- [Specification](../../spec.md) — the canonical TASKS.md format
- [Root README](../../README.md) — project overview and quick start
- [`@tasks-md/lint`](../lint/) — TASKS.md linter
- [`@tasks-md/parser`](../parser/) — shared TypeScript parser
- [`tasks-mcp`](../mcp/) — MCP server with the same operations
- [User stories](../../docs/user-stories/) — runnable walkthroughs for every command

## License

[MIT](../../LICENSE)
