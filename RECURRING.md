# Recurring work

Work that comes back on a schedule. Each row names the command and what to
do with its output. This is a quiet repo, so the cadence is monthly.

| Cadence | Work | Command | What to do with the output |
|---|---|---|---|
| Monthly, or after a burst of PRs | Repo checkup | `npm run checkup` | Fix a `✗`, answer the questions at the end, file a P0 for any broken story |
| Monthly (inside the checkup) | **Speed review** of the gate | `npm run checkup`, section 5 | Take the slowest step. If `gate_ms` passed its pivot in [docs/metrics.md](docs/metrics.md), file a task with Hypothesis, Measurement, Success, Pivot, and Anchor. Record the result in [docs/learnings.md](docs/learnings.md) |
| Monthly (inside the checkup) | agentbrew new-project requirements audit | `npm run checkup`, section 7 | When due, re-read every map and waiver in `.agents/requirements.yaml`, fix any that no longer hold, then `bash ~/.claude/skills/new-project/scripts/audit-due.sh . --record` |
| Monthly (inside the checkup) | Vision kill criteria | read [VISION.md § Kill criteria](VISION.md#kill-criteria) next to the `adoption` row | On or after 2027-10-16, apply the kill criteria |
| At each release | CHANGELOG | `bash scripts/sync-versions.sh <version>` | The bump PR carries the generated section; never edit `CHANGELOG.md` by hand |
