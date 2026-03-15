#!/bin/bash
# Sync Jira issues into a TASKS.md file.
# Requires: curl, python3, JIRA_URL and JIRA_TOKEN environment variables
#
# Usage: sync-jira.sh --project KEY [--jql JQL] [--output FILE] [--merge]
#
# Authentication:
#   JIRA_URL    — Base URL (e.g. https://jira.example.com or https://example.atlassian.net)
#   JIRA_TOKEN  — API token (Cloud: user:token base64, Server: Bearer token)
#   JIRA_AUTH   — Auth type: "basic" (default, Cloud) or "bearer" (Server/DC)
#
# Priority mapping (from Jira priority names):
#   Highest, Blocker, Critical → P0
#   High                       → P1
#   Medium                     → P2 (default)
#   Low, Lowest                → P3
#
# Jira labels become tags. Issue keys become IDs (e.g. jira-PROJ-123).
set -euo pipefail

PROJECT=""
JQL=""
OUTPUT=""
MERGE=false
MAX_RESULTS=200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --jql)     JQL="$2"; shift 2 ;;
    --output)  OUTPUT="$2"; shift 2 ;;
    --merge)   MERGE=true; shift ;;
    --max)     MAX_RESULTS="$2"; shift 2 ;;
    -h|--help)
      cat << 'EOF'
Usage: sync-jira.sh --project KEY [--jql JQL] [--output FILE] [--merge]

Generates a TASKS.md from Jira issues.

Options:
  --project  Jira project key (required unless --jql is provided)
  --jql      Custom JQL query (overrides --project default)
  --output   Output file (default: stdout)
  --merge    Preserve existing manual tasks; only add/remove Jira-synced tasks
  --max      Maximum results to fetch (default: 200)

Environment:
  JIRA_URL    Base URL (e.g. https://jira.example.com)
  JIRA_TOKEN  API token or base64-encoded user:token
  JIRA_AUTH   Auth type: "basic" (default) or "bearer"
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── Validate prerequisites ──────────────────────────────────────────
if [[ -z "${JIRA_URL:-}" ]]; then
  echo "Error: JIRA_URL environment variable not set" >&2
  echo "  export JIRA_URL=https://your-instance.atlassian.net" >&2
  exit 1
fi

if [[ -z "${JIRA_TOKEN:-}" ]]; then
  echo "Error: JIRA_TOKEN environment variable not set" >&2
  echo "  For Jira Cloud: export JIRA_TOKEN=\$(echo -n 'user@email:api-token' | base64)" >&2
  echo "  For Jira Server: export JIRA_TOKEN=your-bearer-token" >&2
  exit 1
fi

if [[ -z "$PROJECT" && -z "$JQL" ]]; then
  echo "Error: --project or --jql is required" >&2
  exit 1
fi

AUTH_TYPE="${JIRA_AUTH:-basic}"
if [[ "$AUTH_TYPE" == "basic" ]]; then
  AUTH_HEADER="Authorization: Basic $JIRA_TOKEN"
else
  AUTH_HEADER="Authorization: Bearer $JIRA_TOKEN"
fi

# Build JQL if not provided
if [[ -z "$JQL" ]]; then
  JQL="project = $PROJECT AND resolution = Unresolved ORDER BY priority ASC, updated DESC"
fi

# ── Fetch issues from Jira REST API ────────────────────────────────
api_url="${JIRA_URL}/rest/api/2/search"
encoded_jql=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$JQL'))")

response=$(curl -s -w "\n%{http_code}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${api_url}?jql=${encoded_jql}&maxResults=${MAX_RESULTS}&fields=summary,priority,labels,issuetype,status,key")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" != "200" ]]; then
  echo "Error: Jira API returned HTTP $http_code" >&2
  echo "$body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for msg in data.get('errorMessages', []):
        print(f'  {msg}', file=sys.stderr)
    for k, v in data.get('errors', {}).items():
        print(f'  {k}: {v}', file=sys.stderr)
except:
    print(sys.stdin.read(), file=sys.stderr)
" 2>&1 >&2 || true
  exit 1
fi

issue_count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('issues', [])))")

if [[ "$issue_count" == "0" ]]; then
  echo "No issues found for query: $JQL" >&2
  exit 0
fi

# ── Priority mapping ────────────────────────────────────────────────
# Jira priorities → P-levels
priority_for_jira() {
  case "${1,,}" in
    highest|blocker|critical) echo 0 ;;
    high)                     echo 1 ;;
    medium)                   echo 2 ;;
    low|lowest)               echo 3 ;;
    *)                        echo 2 ;;
  esac
}

# ── Parse issues into priority buckets ──────────────────────────────
declare -a P0_TASKS=() P1_TASKS=() P2_TASKS=() P3_TASKS=()

parsed=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for issue in data.get('issues', []):
    key = issue['key']
    fields = issue['fields']
    summary = fields.get('summary', '').replace('\t', ' ')
    priority_name = (fields.get('priority') or {}).get('name', 'Medium')
    labels = ','.join(fields.get('labels', []))
    issue_type = (fields.get('issuetype') or {}).get('name', '')
    status = (fields.get('status') or {}).get('name', '')
    print(f'{key}\t{summary}\t{priority_name}\t{labels}\t{issue_type}\t{status}')
")

while IFS=$'\t' read -r key summary priority_name labels _issue_type _status; do
  [[ -z "$key" ]] && continue

  priority=$(priority_for_jira "$priority_name")

  # Build tags from labels
  tag_list=()
  if [[ -n "$labels" ]]; then
    IFS=',' read -ra label_array <<< "$labels"
    for label in "${label_array[@]}"; do
      tag_list+=("${label,,}")
    done
  fi

  # Build task block
  task_line="- [ ] ${summary}"
  metadata=$'\n'"  - **ID**: jira-${key}"

  if [[ ${#tag_list[@]} -gt 0 ]]; then
    tag_str=$(IFS=,; echo "${tag_list[*]}"); tag_str="${tag_str//,/, }"
    metadata+=$'\n'"  - **Tags**: ${tag_str}"
  fi

  task_block="${task_line}${metadata}"

  case $priority in
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

  # Remove tasks with jira-* IDs (will be re-added from sync)
  local cleaned
  cleaned=$(echo "$existing" | python3 -c "
import sys, re

lines = sys.stdin.read().split('\n')
result = []
skip_block = False

for i, line in enumerate(lines):
    if re.match(r'^- \[[ x]\]', line):
        skip_block = False
        # Look ahead for jira-* ID in metadata
        for j in range(i + 1, min(i + 10, len(lines))):
            if re.match(r'^\s+-\s+\*\*ID\*\*:', lines[j]):
                if re.search(r'jira-[A-Z]+-\d+', lines[j]):
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
  echo "Merged ${issue_count} Jira issue(s) into ${OUTPUT} (manual tasks preserved)" >&2
elif [[ -n "$OUTPUT" ]]; then
  generate > "$OUTPUT"
  echo "Wrote ${issue_count} Jira issue(s) to ${OUTPUT}" >&2
else
  generate
fi
