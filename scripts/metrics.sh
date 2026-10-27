#!/usr/bin/env bash
# Print the tasks.md metrics table: value, goal, and pivot for each metric.
#
# Usage: bash scripts/metrics.sh [--offline]
#
# A metric with no data prints "(stub)", never 0, so a missing source is never
# read as a real zero. --offline skips the network metrics (npm, GitHub).
# Definitions, goals, and pivots: docs/metrics.md.
# Runs under macOS /bin/bash 3.2.
set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
offline=0
[ "${1:-}" = --offline ] && offline=1

row() { printf '%-24s %-12s %-28s %s\n' "$1" "$2" "$3" "$4"; }

# code_search <query>: GitHub code search hit count, or "(stub)" offline or on error.
code_search() {
  [ "$offline" = 0 ] && command -v gh >/dev/null 2>&1 || { echo "(stub)"; return; }
  n="$(gh api -X GET search/code -f q="$1" --jq .total_count 2>/dev/null || true)"
  case "$n" in ''|*[!0-9]*) echo "(stub)" ;; *) echo "$n" ;; esac
}

# labelled_issues <label>: issues with the label opened in the last 90 days.
# gh lists 0 issues for a label that does not exist; that is not a real zero, so
# a missing label prints "(stub)".
labelled_issues() {
  [ "$offline" = 0 ] && command -v gh >/dev/null 2>&1 || { echo "(stub)"; return; }
  since="$(date -u -v-90d +%Y-%m-%d 2>/dev/null || date -u -d '90 days ago' +%Y-%m-%d)"
  has_label="$(cd "$root" && gh label list --search "$1" --json name --jq "[.[] | select(.name == \"$1\")] | length" 2>/dev/null || true)"
  [ "${has_label:-0}" -ge 1 ] 2>/dev/null || { echo "(stub)"; return; }
  n="$(cd "$root" && gh issue list --label "$1" --state all --limit 1000 --search "created:>=$since" --json number --jq length 2>/dev/null || true)"
  case "$n" in ''|*[!0-9]*) echo "(stub)" ;; *) echo "$n" ;; esac
}

# Exact queries, pinned: one missing qualifier changes the count several times over.
adoption="$(code_search 'filename:TASKS.md path:/ "## P0"')"
# US02: share of root queues that define done with an **Acceptance** field.
acceptance="$(code_search 'filename:TASKS.md path:/ "**Acceptance**"')"
acceptance_share="(stub)"
case "$acceptance$adoption" in *stub*) ;; *) [ "$adoption" -gt 0 ] && acceptance_share="$((acceptance * 100 / adoption))%" ;; esac
# US09: root queues that use a standing audit loop.
standing_loops="$(code_search 'filename:TASKS.md path:/ "standing-loop"')"
# US03, US04, US05, US07: failure rate of this machine's own events per story,
# from the content-free log (docs/observability.md). "(stub)" without a log or events.
events_log="${TASKS_EVENTS_FILE:-${XDG_STATE_HOME:-$HOME/.local/state}/tasks-md/events.jsonl}"
# story_failures <story> [event]: optional event name narrows it (US03 counts only claim).
story_failures() {
  [ -f "$events_log" ] || { echo "(stub)"; return; }
  node -e '
const [file, story, event] = process.argv.slice(1);
const ev = require("fs").readFileSync(file, "utf-8").split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((e) => e && e.component !== "cli" && e.story === story && (!event || e.event === event));
console.log(ev.length ? Math.round((100 * ev.filter((e) => !e.ok).length) / ev.length) + "% of " + ev.length : "(stub)");
' "$events_log" "$1" "${2:-}"
}
# US10: public repos with this project's /next-task skill installed for Claude Code.
next_task_installs="$(code_search 'filename:SKILL.md path:.claude/skills/next-task "TASKS.md"')"

# npm weekly downloads for one package; "(stub)" when the API is unreachable.
downloads() {
  [ "$offline" = 0 ] || { echo "(stub)"; return; }
  n="$(curl -fsS --max-time 10 "https://api.npmjs.org/downloads/point/last-week/$1" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const n=JSON.parse(s).downloads;console.log(Number.isInteger(n)?n:"")}catch{console.log("")}})')"
  echo "${n:-(stub)}"
}

# gate_ms: median wall time of the last 10 full gate runs (scripts/check.sh) in .metrics/events.jsonl.
gate_ms="(stub)"
cached_gate_ms="(stub)"
events="$root/.metrics/events.jsonl"
if [ -f "$events" ]; then
  read -r gate_ms cached_gate_ms <<EOF
$(node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf-8").split("\n").filter(Boolean);
const gates = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((e) => e && e.event === "gate" && e.mode !== "fast" && Number.isFinite(e.ms));
const median = (xs) => { if (!xs.length) return "(stub)"; const s = xs.slice(-10).sort((a, b) => a - b); return String(s[Math.floor(s.length / 2)]); };
console.log(median(gates.filter((e) => !e.cached_all).map((e) => e.ms)), median(gates.filter((e) => e.cached_all).map((e) => e.ms)));
' "$events")
EOF
fi

row metric value goal pivot
row adoption "$adoption" ">=1000 by 2027-06-30" "<450 on 2027-03-31"
row npm_cli_weekly "$(downloads @tasks-md/cli)" ">=200 by 2027-06-30" "<50 on 2027-03-31"
row npm_lint_weekly "$(downloads @tasks-md/lint)" ">=974 (no drop)" "<500 for 4 weeks"
row npm_parser_weekly "$(downloads @tasks-md/parser)" ">=979 (no drop)" "<500 for 4 weeks"
row npm_mcp_weekly "$(downloads tasks-mcp)" ">=50 by 2027-06-30" "<10 on 2027-03-31"
row gate_ms "$gate_ms" "<=120000 full" ">180000 full"
row cached_gate_ms "$cached_gate_ms" "<=15000 all cached" ">30000 all cached"
row lint_false_positives "$(labelled_issues lint-false-positive)" "0 per 90 days" ">=3 per 90 days"
row acceptance_share "$acceptance_share" ">=25% by 2027-06-30" "<15% on 2027-03-31"
row sync_bug_reports "$(labelled_issues sync)" "0 per 90 days" ">=3 per 90 days"
row standing_loop_queues "$standing_loops" ">=5 by 2027-06-30" "0 on 2027-03-31"
row next_task_installs "$next_task_installs" ">=50 by 2027-06-30" "<15 on 2027-03-31"
row us03_claim_losses "$(story_failures US03 claim)" "<5% per month" ">=15% per month"
row us04_pick_failures "$(story_failures US04)" "0%" ">=5%"
row us05_workspace_failures "$(story_failures US05)" "0%" ">=5%"
row us07_list_failures "$(story_failures US07)" "0%" ">=5%"
