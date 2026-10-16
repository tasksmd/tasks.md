# Learnings

Append-only. One row per change whose result we predicted before we made it:
what we predicted, what we observed, and the lesson. Add a row when a PR
closes, or when the speed review in the checkup changes the gate. Never edit
an old row; add a new one that corrects it.

| Date | Change | Predicted | Observed | Lesson |
|---|---|---|---|---|
| 2026-10-16 | Pre-registered tasks, secret hygiene, generated CHANGELOG (#26) | setup score 7/24 → 10/24 | 10/24; the claim check first failed because a local hook put the agent footer after the `Task:` trailers, so git stopped parsing them | Trailers must be the last paragraph of the commit message; put any footer before them |
| 2026-10-16 | Dated adoption goal and metrics table (#27) | adoption baseline from GitHub code search | 340 root `TASKS.md` files with `## P0` (`path:/`); 1,920 without `path:/` | Pin the exact query in the metric; a missing qualifier changed the number 5.6× |
| 2026-10-16 | `scripts/setup.sh` (#28) | one command, exit 0 | first run failed at `lefthook install` on a machine with a global `core.hooksPath` | Setup must warn, not fail, on optional hook installs; a shared hooks path is common |
| 2026-10-16 | Stranger-install e2e (#29) | 18 cases pass from packed tarballs | 18/18 in 7 s locally; the Jira fake fails in the agent sandbox (`listen EPERM`) | Tests that bind a port need a note in Gotchas and must run outside the sandbox |
| 2026-10-16 | Turborepo-cached gate (`scripts/check.sh`) | full gate ≤ 120 s; all-cached gate ≤ 15 s | full (`NO_CACHE=1`) 78 s; all cached 4.2 s; a new docs file re-ran only lint | Declare every root file a test reads as a Turborepo input (`$TURBO_ROOT$/…`), or the cache can skip a needed run |
