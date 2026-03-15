#!/bin/bash
# Sync Linear issues into a TASKS.md file.
# Requires: curl, python3, LINEAR_API_KEY environment variable
#
# Usage: sync-linear.sh --team TEAM [--project PROJECT] [--filter FILTER] [--output FILE] [--merge]
#
# Authentication:
#   LINEAR_API_KEY — Personal API key from https://linear.app/settings/api
#
# Priority mapping (from Linear priority values):
#   1 (Urgent)    → P0
#   2 (High)      → P1
#   3 (Medium)    → P2 (default)
#   4 (Low)       → P3
#   0 (No priority) → P3
#
# Linear labels become tags. Issue identifiers become IDs (e.g. linear-ENG-123).
set -euo pipefail

TEAM=""
PROJECT=""
FILTER=""
OUTPUT=""
MERGE=false
MAX_RESULTS=200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --team)    TEAM="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --filter)  FILTER="$2"; shift 2 ;;
    --output)  OUTPUT="$2"; shift 2 ;;
    --merge)   MERGE=true; shift ;;
    --max)     MAX_RESULTS="$2"; shift 2 ;;
    -h|--help)
      cat << 'EOF'
Usage: sync-linear.sh --team TEAM [--project PROJECT] [--output FILE] [--merge]

Generates a TASKS.md from Linear issues.

Options:
  --team     Linear team key (required, e.g. "ENG")
  --project  Filter by Linear project name (optional)
  --filter   Custom Linear issue filter as JSON (overrides defaults)
  --output   Output file (default: stdout)
  --merge    Preserve existing manual tasks; only add/remove Linear-synced tasks
  --max      Maximum results to fetch (default: 200)

Environment:
  LINEAR_API_KEY  Personal API key from https://linear.app/settings/api

Examples:
  sync-linear.sh --team ENG
  sync-linear.sh --team ENG --project "Q1 Launch" --output TASKS.md
  sync-linear.sh --team ENG --output TASKS.md --merge
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── Validate prerequisites ──────────────────────────────────────────
if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo "Error: LINEAR_API_KEY environment variable not set" >&2
  echo "  Get your key at: https://linear.app/settings/api" >&2
  echo "  export LINEAR_API_KEY=lin_api_..." >&2
  exit 1
fi

if [[ -z "$TEAM" ]]; then
  echo "Error: --team is required" >&2
  exit 1
fi

# ── Build GraphQL query ──────────────────────────────────────────────
# Construct the filter object for the Linear API
build_filter() {
  python3 -c "
import json

team = '$TEAM'
project = '$PROJECT'
custom_filter = '''$FILTER'''

if custom_filter.strip():
    print(custom_filter)
else:
    f = {
        'team': {'key': {'eq': team}},
        'state': {'type': {'nin': ['completed', 'canceled']}}
    }
    if project:
        f['project'] = {'name': {'eq': project}}
    print(json.dumps(f))
"
}

FILTER_JSON=$(build_filter)

QUERY=$(cat << 'GRAPHQL'
query($filter: IssueFilter!, $first: Int!) {
  issues(filter: $filter, first: $first, orderBy: updatedAt) {
    nodes {
      identifier
      title
      priority
      priorityLabel
      labels {
        nodes {
          name
        }
      }
      state {
        name
        type
      }
      project {
        name
      }
    }
  }
}
GRAPHQL
)

# ── Fetch issues from Linear GraphQL API ─────────────────────────────
PAYLOAD=$(python3 -c "
import json
query = '''$QUERY'''
variables = {'filter': json.loads('''$FILTER_JSON'''), 'first': $MAX_RESULTS}
print(json.dumps({'query': query, 'variables': variables}))
")

response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.linear.app/graphql")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" != "200" ]]; then
  echo "Error: Linear API returned HTTP $http_code" >&2
  echo "$body" | head -5 >&2
  exit 1
fi

# Check for GraphQL errors
has_errors=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
errors = data.get('errors', [])
if errors:
    for e in errors:
        print(e.get('message', ''), file=sys.stderr)
    print('true')
else:
    print('false')
" 2>&2)

if [[ "$has_errors" == "true" ]]; then
  exit 1
fi

issue_count=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data.get('data', {}).get('issues', {}).get('nodes', [])))
")

if [[ "$issue_count" == "0" ]]; then
  echo "No issues found for team $TEAM" >&2
  exit 0
fi

# ── Priority mapping ────────────────────────────────────────────────
# Linear priorities: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
priority_for_linear() {
  case "$1" in
    1) echo 0 ;;  # Urgent → P0
    2) echo 1 ;;  # High → P1
    3) echo 2 ;;  # Medium → P2
    4) echo 3 ;;  # Low → P3
    0) echo 3 ;;  # No priority → P3
    *) echo 2 ;;  # Default → P2
  esac
}

# ── Parse issues into priority buckets ──────────────────────────────
declare -a P0_TASKS=() P1_TASKS=() P2_TASKS=() P3_TASKS=()

parsed=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for issue in data.get('data', {}).get('issues', {}).get('nodes', []):
    identifier = issue.get('identifier', '')
    title = issue.get('title', '').replace('\t', ' ')
    priority = issue.get('priority', 3)
    labels = ','.join(n.get('name', '') for n in issue.get('labels', {}).get('nodes', []))
    state = issue.get('state', {}).get('name', '')
    print(f'{identifier}\t{title}\t{priority}\t{labels}\t{state}')
")

while IFS=$'\t' read -r identifier title priority labels _state; do
  [[ -z "$identifier" ]] && continue

  p_level=$(priority_for_linear "$priority")

  # Build tags from labels
  tag_list=()
  if [[ -n "$labels" ]]; then
    IFS=',' read -ra label_array <<< "$labels"
    for label in "${label_array[@]}"; do
      # Lowercase and convert spaces to hyphens for tag format
      clean=$(echo "$label" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
      [[ -n "$clean" ]] && tag_list+=("$clean")
    done
  fi

  # Build task block
  task_line="- [ ] ${title}"
  metadata=$'\n'"  - **ID**: linear-${identifier}"

  if [[ ${#tag_list[@]} -gt 0 ]]; then
    tag_str=$(IFS=,; echo "${tag_list[*]}"); tag_str="${tag_str//,/, }"
    metadata+=$'\n'"  - **Tags**: ${tag_str}"
  fi

  task_block="${task_line}${metadata}"

  case $p_level in
    0) P0_TASKS+=("$task_block") ;;
    1) P1_TASKS+=("$task_block") ;;
    2) P2_TASKS+=("$task_block") ;;
    3) P3_TASKS+=("$task_block") ;;
  esac
done <<< "$parsed"

# ── Generate output ─────────────────────────────────────────────────
generate() {
  echo "# Tasks"

  local has_output=false

  for p in 0 1 2 3; do
    local -n bucket="P${p}_TASKS"
    if [[ ${#bucket[@]} -gt 0 ]]; then
      echo ""
      echo "## P${p}"
      echo ""
      for task in "${bucket[@]}"; do
        echo "$task"
        echo ""
      done
      has_output=true
    fi
  done

  if ! $has_output; then
    echo ""
    echo "## P2"
    echo ""
  fi
}

# ── Merge mode: preserve manual tasks, add/remove synced ones ──────
merge_into_existing() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    generate > "$target"
    return
  fi

  local existing
  existing=$(cat "$target")

  # Remove tasks with linear-* IDs (will be re-added from sync)
  local cleaned
  cleaned=$(echo "$existing" | python3 -c "
import sys, re

lines = sys.stdin.read().split('\n')
result = []
skip_block = False

for i, line in enumerate(lines):
    if re.match(r'^- \[[ x]\]', line):
        skip_block = False
        # Look ahead for linear-* ID in metadata
        for j in range(i + 1, min(i + 10, len(lines))):
            if re.match(r'^\s+-\s+\*\*ID\*\*:', lines[j]):
                if re.search(r'linear-[A-Z]+-\d+', lines[j]):
                    skip_block = True
                break
            if not re.match(r'^\s', lines[j]) and lines[j].strip() != '':
                break
        if skip_block:
            continue
    elif skip_block:
        if re.match(r'^\s{2,}', line) or line.strip() == '':
            continue
        else:
            skip_block = False
    result.append(line)

print('\n'.join(result))
")

  # Append new issue tasks into priority sections
  local temp
  temp=$(mktemp)
  echo "$cleaned" > "$temp"

  for p in 0 1 2 3; do
    local -n bucket="P${p}_TASKS"
    [[ ${#bucket[@]} -eq 0 ]] && continue

    if ! grep -q "^## P${p}$" "$temp"; then
      local inserted=false
      for np in $(seq $((p + 1)) 3); do
        if grep -q "^## P${np}$" "$temp"; then
          sed -i '' "/^## P${np}$/i\\
\\
## P${p}\\
" "$temp"
          inserted=true
          break
        fi
      done
      if ! $inserted; then
        { echo ""; echo "## P${p}"; echo ""; } >> "$temp"
      fi
    fi

    for task in "${bucket[@]}"; do
      local escaped
      escaped=$(echo "$task" | sed 's/[&/\\]/\\&/g')
      sed -i '' "/^## P${p}$/a\\
\\
${escaped}\\
" "$temp"
    done
  done

  cat "$temp" > "$target"
  rm -f "$temp"
}

# ── Output ──────────────────────────────────────────────────────────
if $MERGE && [[ -n "$OUTPUT" ]]; then
  merge_into_existing "$OUTPUT"
  echo "Merged ${issue_count} Linear issue(s) into ${OUTPUT} (manual tasks preserved)" >&2
elif [[ -n "$OUTPUT" ]]; then
  generate > "$OUTPUT"
  echo "Wrote ${issue_count} Linear issue(s) to ${OUTPUT}" >&2
else
  generate
fi
