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
| `npm_cli_weekly`: weekly downloads of `@tasks-md/cli` | ≥ 200 by 2027-06-30 | < 50 on 2027-03-31: the CLI is not the entry point; invest in docs and commands instead | `curl -s https://api.npmjs.org/downloads/point/last-week/@tasks-md/cli` | 20 |
| `npm_lint_weekly`: weekly downloads of `@tasks-md/lint` | no drop below the baseline | < 500 for 4 weeks in a row: find which CI users left | same API, `@tasks-md/lint` | 974 |
| `npm_parser_weekly`: weekly downloads of `@tasks-md/parser` | no drop below the baseline | < 500 for 4 weeks in a row | same API, `@tasks-md/parser` | 979 |
| `npm_mcp_weekly`: weekly downloads of `tasks-mcp` | ≥ 50 by 2027-06-30 | < 10 on 2027-03-31: fold MCP into the CLI docs, stop separate promotion | same API, `tasks-mcp` | 7 |
| `gate_ms`: median wall time of the last 10 full gate runs | ≤ 120,000 ms | > 180,000 ms: split or cache the slowest step | `bash scripts/metrics.sh` (reads `.metrics/events.jsonl`) | (stub) until the timed gate lands |
| `cached_gate_ms`: median wall time of the last 10 gate runs where every step was a cache hit | ≤ 15,000 ms | > 30,000 ms: the cache key is too wide | `bash scripts/metrics.sh` | (stub) until the timed gate lands |
| `lint_false_positives`: issues labelled `lint-false-positive` opened in the last 90 days | 0 | ≥ 3: review the rules that fired, and loosen or drop them | `gh issue list --label lint-false-positive --state all --search "created:>=<date>"` | 0 |

## Notes

- `lint` and `parser` downloads move together because the linter depends on
  the parser, and most of them likely come from CI installs. They show whether
  existing users stay, not whether new users arrive.
- The adoption query counts files, not repos, and GitHub code search only
  indexes public repos. It is a lower bound and a trend, not a census.
- Report a lint false positive by opening an issue with the
  `lint-false-positive` label.
- The kill criteria that use these metrics live in
  [`VISION.md` § Kill criteria](../VISION.md#kill-criteria).
