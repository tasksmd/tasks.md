#!/usr/bin/env bash
# The repo-wide checkup: one command that reports open work, health, the cached gate,
# broken user stories, metrics and speed, the task queue, and the monthly
# requirements audit, then ends with at most three questions for the owner.
#
# Usage: bash scripts/checkup.sh        (npm run checkup)
#
# Run it monthly (RECURRING.md) or after a burst of work. It is read-only
# apart from .metrics/ and the gate's Turborepo cache. Exit 1 when the doctor
# or the gate fails. Runs under macOS /bin/bash 3.2.
set -uo pipefail

cd "$(dirname "$0")/.."
cli="node packages/cli/dist/cli.js"
lint="node packages/lint/dist/cli.js"
skill="${NEW_PROJECT_SKILL:-$HOME/.claude/skills/new-project}"
questions=""
status=0

section() { printf '\n## %s\n\n' "$1"; }
ask() { questions="$questions
$1"; }

[ -f packages/cli/dist/cli.js ] || npm run build >/dev/null

section "0. Open work (open PRs, drafts, unmerged branches, worktrees)"
# Finish these before new work: /next-task continues them first (Continue open work).
if command -v gh >/dev/null 2>&1; then
  gh pr list --author @me --state open --json number,isDraft,headRefName,title \
    --jq '.[] | "  \(if .isDraft then "draft-pr" else "pr" end) #\(.number) \(.headRefName): \(.title)"' \
    2>/dev/null || echo "  (pull requests not checked: gh is not signed in)"
fi
git for-each-ref --format='%(refname:short)' refs/heads | while read -r b; do
  case "$b" in tasks-claims | gh-pages | dependabot/* | renovate/*) continue ;; esac  # data and bot branches
  n="$(git rev-list --count "origin/main..$b" 2>/dev/null || echo 0)"
  if [ "$n" -gt 0 ]; then echo "  branch $b: $n commit(s) not on main"; fi
done
git worktree list | sed -n '2,$s/^/  worktree /p'
echo "-> continue each with /next-task (it resumes open PRs and branches first)"

section "1. Health (tasks doctor)"
if ! $cli doctor; then
  status=1
  ask "tasks doctor reports a failure (✗ above). Fix it now, or file a P0?"
fi

section "2. Gate (scripts/check.sh full, cached)"
gate_log="$(mktemp "${TMPDIR:-/tmp}/tasksmd-checkup.XXXXXX")"
bash scripts/check.sh full > "$gate_log" 2>&1
gate_rc=$?
grep -E '^--- |^(✓|✗) gate' "$gate_log"
if [ "$gate_rc" != 0 ]; then
  status=1
  ask "The gate failed (log: $gate_log). Fix it before new work?"
fi

section "3. Broken user stories"
broken="$(grep -oE '✖ US[0-9]{2}[^(]*' "$gate_log" | sort -u)"
if [ -n "$broken" ]; then
  echo "$broken"
  ask "These user stories are broken: $(echo "$broken" | grep -oE 'US[0-9]{2}' | sort -u | tr '\n' ' ')- which one first?"
else
  echo "none (every e2e story case passed or was unchanged since it passed)"
fi

section "4. Metrics (scripts/metrics.sh)"
bash scripts/metrics.sh

section "5. Speed review (gate steps, last 30 days)"
if [ -f .metrics/events.jsonl ]; then
  node -e '
const lines = require("fs").readFileSync(".metrics/events.jsonl", "utf-8").split("\n").filter(Boolean);
const since = Date.now() - 30 * 86400e3;
const steps = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((e) => e && e.event === "step" && !e.cached && Date.parse(e.ts) >= since);
const by = {};
for (const e of steps) (by[e.step] ||= []).push(e.ms);
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = Object.entries(by).map(([step, xs]) => [step, median(xs), xs.length]).sort((a, b) => b[1] - a[1]);
if (!rows.length) { console.log("(stub) no uncached step runs in the last 30 days"); process.exit(0); }
console.log("step          median_ms  runs");
for (const [step, ms, n] of rows) console.log(step.padEnd(14) + String(ms).padStart(9) + String(n).padStart(6));
console.log("\nSlowest step: " + rows[0][0] + ". Goal and pivot: docs/metrics.md (gate_ms). Log what you change in docs/learnings.md.");
'
else
  echo "(stub) no .metrics/events.jsonl yet; run bash scripts/check.sh"
fi

section "6. Task queue"
p0="$($cli list --priority P0 --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s);console.log(t.length);for(const x of t)console.error("  P0 "+x.id+(x.assignee?" (@"+x.assignee+")":""))}catch{console.log("?")}})')"
echo "open P0 tasks: $p0"
[ "$p0" = 0 ] || [ "$p0" = "?" ] || ask "There are $p0 open P0 task(s). Are they still the top priority?"
render="$(mktemp "${TMPDIR:-/tmp}/tasksmd-render.XXXXXX")"
if $cli render > "$render" 2>/dev/null && [ -s "$render" ]; then
  if $lint --require-prereg "$render" > /dev/null 2>&1; then
    echo "every task in the live log has the five rule-#9 fields"
  else
    $lint --require-prereg "$render" 2>&1 | grep -E 'rule-#9 task' | sed -E 's#^ERROR: [^:]+: #  #'
    ask "Some tasks lack rule-#9 fields (above). Add them with tasks update <id> --body?"
  fi
fi
rm -f "$render"

section "7. Monthly requirements audit"
if [ -x "$skill/scripts/audit-due.sh" ]; then
  if due="$(bash "$skill/scripts/audit-due.sh" .)"; then
    echo "$due"
    bash "$skill/scripts/check-setup.sh" . --profile tool | tail -3
    echo "Next: re-read every map and waiver in .agents/requirements.yaml, then: bash $skill/scripts/audit-due.sh . --record"
  else
    echo "$due"
  fi
else
  echo "(skipped) the agentbrew new-project skill is not installed at $skill (set NEW_PROJECT_SKILL)"
fi

section "Questions for the owner"
if [ -n "$questions" ]; then
  echo "$questions" | sed '/^$/d' | head -3 | nl -w1 -s'. '
else
  echo "none"
fi

rm -f "$gate_log"
exit "$status"
