# Metrics

What we measure, the goal for each metric, and the pivot: the number below
which we change approach instead of retrying. `bash scripts/metrics.sh`
prints every row with its current value. A metric with no data shows
`(stub)`, never `0`. `--offline` skips the network rows.

Rule: a metric is added with its goal, pivot, and command in the same PR, and
never picked after seeing the result (see the pre-registration rule in
[`spec.md` § Rule #9](../spec.md#rule-9-pre-registration-block)).

## Metrics

| Metric | Goal | Pivot | Command | Baseline (2026-10-16) |
|---|---|---|---|---|
| `adoption`: root `TASKS.md` files with a `## P0` section on GitHub code search | ≥ 1,000 by 2027-06-30 | < 450 on 2027-03-31: rethink distribution, not features | `gh api -X GET search/code -f q='filename:TASKS.md path:/ "## P0"' --jq .total_count` | 340 |
| `npm_cli_weekly`: weekly downloads of `@tasks-md/cli` | ≥ 200 by 2027-06-30 | < 50 on 2027-03-31: the CLI is not the entry point; invest in docs and commands instead | `curl -s https://api.npmjs.org/downloads/point/last-week/@tasks-md/cli \| jq .downloads` | 20 |
| `npm_lint_weekly`: weekly downloads of `@tasks-md/lint` | no drop below the baseline | < 500 for 4 weeks in a row: find which CI users left | `curl -s https://api.npmjs.org/downloads/point/last-week/@tasks-md/lint \| jq .downloads` | 974 |
| `npm_parser_weekly`: weekly downloads of `@tasks-md/parser` | no drop below the baseline | < 500 for 4 weeks in a row | `curl -s https://api.npmjs.org/downloads/point/last-week/@tasks-md/parser \| jq .downloads` | 979 |
| `npm_mcp_weekly`: weekly downloads of `tasks-mcp` | ≥ 50 by 2027-06-30 | < 10 on 2027-03-31: fold MCP into the CLI docs, stop separate promotion | `curl -s https://api.npmjs.org/downloads/point/last-week/tasks-mcp \| jq .downloads` | 7 |
| `gate_ms`: median wall time of the last 10 full gate runs | ≤ 120,000 ms | > 180,000 ms: split or cache the slowest step | `bash scripts/metrics.sh` (reads `.metrics/events.jsonl`) | (stub) until the timed gate lands |
| `cached_gate_ms`: median wall time of the last 10 gate runs where every step was a cache hit | ≤ 15,000 ms | > 30,000 ms: the cache key is too wide | `bash scripts/metrics.sh` | (stub) until the timed gate lands |
| `lint_false_positives`: issues labelled `lint-false-positive` opened in the last 90 days | 0 | ≥ 3: review the rules that fired, and loosen or drop them | `gh issue list --label lint-false-positive --state all --limit 1000 --search "created:>=$(date -u -v-90d +%F)" --json number --jq length` | 0 |
| `acceptance_share` (US02): root `TASKS.md` files with an `**Acceptance**` field, as a share of `adoption` | ≥ 25% by 2027-06-30 | < 15% on 2027-03-31: the writing guidance does not land; rewrite US02 and the README example | `a=$(gh api -X GET search/code -f q='filename:TASKS.md path:/ "**Acceptance**"' --jq .total_count); t=$(gh api -X GET search/code -f q='filename:TASKS.md path:/ "## P0"' --jq .total_count); echo "$((a * 100 / t))%"` | 57/340 (16%) |
| `sync_bug_reports` (US06): issues labelled `sync` opened in the last 90 days | 0 | ≥ 3: freeze new trackers and harden the existing syncs | `gh issue list --label sync --state all --limit 1000 --search "created:>=$(date -u -v-90d +%F)" --json number --jq length` | 0 (label created 2026-10-16) |
| `standing_loop_queues` (US09): root `TASKS.md` files that use the `standing-loop` tag | ≥ 5 by 2027-06-30 | 0 on 2027-03-31: nobody uses it; move standing loops to a doc pattern and drop the special pick rule | `gh api -X GET search/code -f q='filename:TASKS.md path:/ "standing-loop"' --jq .total_count` | 0 |
| `next_task_installs` (US10): public repos with this project's `/next-task` skill installed for Claude Code | ≥ 50 by 2027-06-30 | < 15 on 2027-03-31: one-prompt setup is not the entry point; invest in the README path instead | `gh api -X GET search/code -f q='filename:SKILL.md path:.claude/skills/next-task "TASKS.md"' --jq .total_count` | 9 |
| `us03_claim_losses` (US03): share of this machine's git-native `claim` events that lose | < 5% per month | ≥ 15%: claims collide too often; review lease length and `pick` order | `jq -s '[.[] \| select(.component != "cli" and .story == "US03" and .event == "claim")] \| {calls: length, failed: (map(select(.ok \| not)) \| length)}' ~/.local/state/tasks-md/events.jsonl`, or `bash scripts/metrics.sh` | (stub) until claims are logged |
| `us04_pick_failures` (US04): share of MCP `pick_task` calls that fail | 0% | ≥ 5%: fix pick before new features | `jq -s '[.[] \| select(.component != "cli" and .story == "US04")] \| {calls: length, failed: (map(select(.ok \| not)) \| length)}' ~/.local/state/tasks-md/events.jsonl`, or `bash scripts/metrics.sh` | (stub) |
| `us05_workspace_failures` (US05): share of MCP `find_next_task_across_workspaces` calls that fail | 0% | ≥ 5% | `jq -s '[.[] \| select(.component != "cli" and .story == "US05")] \| {calls: length, failed: (map(select(.ok \| not)) \| length)}' ~/.local/state/tasks-md/events.jsonl`, or `bash scripts/metrics.sh` | (stub) |
| `us07_list_failures` (US07): share of MCP `list_tasks` calls that fail | 0% | ≥ 5% | `jq -s '[.[] \| select(.component != "cli" and .story == "US07")] \| {calls: length, failed: (map(select(.ok \| not)) \| length)}' ~/.local/state/tasks-md/events.jsonl`, or `bash scripts/metrics.sh` | (stub) |

## Notes

- `lint` and `parser` downloads move together because the linter depends on
  the parser, and most of them likely come from CI installs. They show whether
  existing users stay, not whether new users arrive.
- The adoption query counts files, not repos, and GitHub code search only
  indexes public repos. It is a lower bound and a trend, not a census.
- `lint_false_positives` and `sync_bug_reports` count only the issues people
  report and label, so they undercount; treat any nonzero value as real.
- The `usNN_*` rows read the event log of the machine that runs the script; each
  user sees their own rates, and nothing leaves the machine.
- Report a lint false positive by opening an issue with the
  `lint-false-positive` label, and a sync bug with the `sync` label.
- The kill criteria that use these metrics live in
  [`VISION.md` § Kill criteria](../VISION.md#kill-criteria).
