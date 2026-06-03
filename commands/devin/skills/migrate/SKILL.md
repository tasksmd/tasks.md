---
name: migrate
description: Migrate this repo's TASKS.md queue to the collision-free git-native backend. Use when the user says "migrate to git-native", "convert this repo to git-native", "switch backends", or wants collision-free claims for a multi-contributor repo.
allowed-tools:
  - read
  - write
  - edit
  - grep
  - glob
  - exec
permissions:
  allow:
    - Exec(git *)
    - Exec(npx *)
    - Exec(node *)
    - Exec(lefthook *)
---

## Migrate this repo to the git-native backend

Convert THIS repo's [TASKS.md](https://github.com/tasksmd/tasks.md) queue from the file backend to the **git-native** backend — collision-free claims via git's atomic ref compare-and-swap, with `TASKS.md` becoming a single-writer generated snapshot. Use this the moment a repo has **more than one writer** (multiple contributors, or a fleet of machines each running parallel agents), so concurrent claims stop colliding on `TASKS.md`. Do it end to end, safely, then verify and report. **Never lose the existing queue** and never overwrite user content.

> Requires Node (`npx`). If Node is unavailable, stop and tell the user — the git-native backend is driven by the `tasks` CLI.

### Steps

1. **Confirm the repo root and current backend.** Run `git rev-parse --show-toplevel` (stop if not a git repo). Read `.tasksmd.json` if present: if it already declares `"backend": "git-native"`, this repo is already migrated — run `npx -y @tasks-md/cli doctor` and report; do not migrate again.

2. **Capture the current queue.** Run `npx -y @tasks-md/cli list --json` and keep the list of open task ids — you will confirm none are lost after the flip.

3. **Dry-run the import.** Run `npx -y @tasks-md/cli migrate` (dry-run by default). It prints the `created`/`claimed` events it *would* append to the `tasks-claims` log from the current `TASKS.md`, preserving ids, priority, tags, and details. Show the user this preview. Do not pass `--apply` yet.

4. **Apply the import, then initialise the backend.** On confirmation:
   - `npx -y @tasks-md/cli migrate --apply` — imports the current `TASKS.md` into the `tasks-claims` log.
   - `npx -y @tasks-md/cli fleet init` — writes `.tasksmd.json` (`backend: git-native`), `lefthook.yml`, the projection workflow (`.github/workflows/tasks-snapshot.yml`), and the path-scoped claim-check workflow (`.github/workflows/tasks-claim-check.yml`), and prints the GitHub Ruleset guidance for protecting `main` + `tasks-claims`.
   - `lefthook install` (if `lefthook` is available) so the local claim-check pre-push hook is active.

   Order matters: **`migrate --apply` before `fleet init`** — a bare `fleet init` starts an empty log and would drop a populated `TASKS.md`.

5. **Switch the team to the git-native task flow.** From now on `TASKS.md` is **generated** — agents and humans do **not** hand-edit it. Update the repo's `AGENTS.md` (and `CONTRIBUTING.md` if present) so the task-queue policy reads:
   - add a task: `tasks create "<title>" --priority P2` ;
   - claim a task: `tasks claim <id>` (collision-free; returns a `claimId` fencing token — a lost race exits nonzero, so pick another task) ;
   - complete a task: `tasks complete <id>` ; release: `tasks unclaim <id>` ;
   - read the live queue with `tasks list` / `tasks pick`, never by trusting a possibly-stale `TASKS.md`.

   The `tasks-mcp` tools and these CLI commands resolve the backend automatically.

6. **Verify before reporting done.**
   - `npx -y @tasks-md/cli doctor` exits 0 (claims ref, projection workflow, claim-check, enforcement level, stale heartbeats, compaction all ok/warn — no fail).
   - `npx -y @tasks-md/cli list` reproduces every open task id captured in step 2 (nothing lost).
   - `npx -y @tasks-md/lint TASKS.md` exits 0 on the regenerated snapshot.

7. **Report — including rollback.** Tell the user the repo is now git-native, how to add/claim/complete tasks, and that they can roll back at any time with `rm .tasksmd.json` and `git update-ref -d refs/heads/tasks-claims` (the original `TASKS.md` content is preserved in the log and the file). Point them at [`spec.md` § Fleet coordination](../spec.md#fleet-coordination) for the model.

### Idempotency + safety

Re-running is safe: step 1 detects an already-migrated repo and stops at `doctor`. The dry-run in step 3 never mutates state. `migrate` preserves task ids and never modifies the original `TASKS.md` before `--apply`. The whole flip is reversible via the step-7 rollback. Migrating other repos is the same command run in each — this repo is converted by exactly this path (VISION G8).
