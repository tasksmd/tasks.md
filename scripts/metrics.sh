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

row() { printf '%-22s %-12s %-28s %s\n' "$1" "$2" "$3" "$4"; }

# adoption: root TASKS.md files with a "## P0" section on GitHub code search.
adoption="(stub)"
if [ "$offline" = 0 ] && command -v gh >/dev/null 2>&1; then
  n="$(gh api -X GET search/code -f q='filename:TASKS.md path:/ "## P0"' --jq .total_count 2>/dev/null || true)"
  case "$n" in ''|*[!0-9]*) ;; *) adoption="$n" ;; esac
fi

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

# lint_false_positives: issues labelled lint-false-positive opened in the last 90 days.
fp="(stub)"
if [ "$offline" = 0 ] && command -v gh >/dev/null 2>&1; then
  since="$(date -u -v-90d +%Y-%m-%d 2>/dev/null || date -u -d '90 days ago' +%Y-%m-%d)"
  n=""
  # gh lists 0 issues for a label that does not exist; that is not a real zero.
  has_label="$(cd "$root" && gh label list --search lint-false-positive --json name --jq length 2>/dev/null || true)"
  [ "${has_label:-0}" -ge 1 ] 2>/dev/null && \
  n="$(cd "$root" && gh issue list --label lint-false-positive --state all --search "created:>=$since" --json number --jq length 2>/dev/null || true)"
  case "$n" in ''|*[!0-9]*) ;; *) fp="$n" ;; esac
fi

row metric value goal pivot
row adoption "$adoption" ">=1000 by 2027-06-30" "<450 on 2027-03-31"
row npm_cli_weekly "$(downloads @tasks-md/cli)" ">=200 by 2027-06-30" "<50 on 2027-03-31"
row npm_lint_weekly "$(downloads @tasks-md/lint)" ">=974 (no drop)" "<500 for 4 weeks"
row npm_parser_weekly "$(downloads @tasks-md/parser)" ">=979 (no drop)" "<500 for 4 weeks"
row npm_mcp_weekly "$(downloads tasks-mcp)" ">=50 by 2027-06-30" "<10 on 2027-03-31"
row gate_ms "$gate_ms" "<=120000 full" ">180000 full"
row cached_gate_ms "$cached_gate_ms" "<=15000 all cached" ">30000 all cached"
row lint_false_positives "$fp" "0 per 90 days" ">=3 per 90 days"
