#!/bin/bash
# Sync GitHub Issues labeled 'tasks.md' into a TASKS.md file.
# Requires: gh CLI (authenticated)
#
# Usage: sync-issues.sh [--repo OWNER/REPO] [--label LABEL] [--output FILE]
#
# Priority mapping (from issue labels):
#   critical, P0  → P0
#   high, P1      → P1
#   medium, P2    → P2 (default)
#   low, P3       → P3
#
# All other labels become tags.
set -euo pipefail

REPO=""
LABEL="tasks.md"
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)   REPO="$2"; shift 2 ;;
    --label)  LABEL="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: sync-issues.sh [--repo OWNER/REPO] [--label LABEL] [--output FILE]"
      echo ""
      echo "Generates a TASKS.md from GitHub Issues with the specified label."
      echo ""
      echo "Options:"
      echo "  --repo    GitHub repo (default: current repo from gh)"
      echo "  --label   Issue label to filter by (default: tasks.md)"
      echo "  --output  Output file (default: stdout)"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install from https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI not authenticated. Run 'gh auth login'" >&2
  exit 1
fi

REPO_FLAG=()
if [[ -n "$REPO" ]]; then
  REPO_FLAG=(--repo "$REPO")
fi

# Fetch issues as JSON
issues_json=$(gh issue list "${REPO_FLAG[@]}" \
  --label "$LABEL" \
  --state open \
  --limit 200 \
  --json number,title,body,labels \
  2>/dev/null)

if [[ -z "$issues_json" || "$issues_json" == "[]" ]]; then
  echo "No open issues found with label '$LABEL'" >&2
  exit 0
fi

# Priority labels (lowercase) → priority level
priority_for_label() {
  case "${1,,}" in
    critical|p0) echo 0 ;;
    high|p1)     echo 1 ;;
    medium|p2)   echo 2 ;;
    low|p3)      echo 3 ;;
    *)           echo "" ;;
  esac
}

# Parse issues into prioritized buckets
declare -a P0_TASKS=() P1_TASKS=() P2_TASKS=() P3_TASKS=()

issue_count=$(echo "$issues_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

for i in $(seq 0 $((issue_count - 1))); do
  title=$(echo "$issues_json" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i]['title'])")
  number=$(echo "$issues_json" | python3 -c "import sys,json; print(json.load(sys.stdin)[$i]['number'])")

  # Extract labels
  label_names=$(echo "$issues_json" | python3 -c "
import sys, json
labels = json.load(sys.stdin)[$i]['labels']
print('\n'.join(l['name'] for l in labels))
")

  # Determine priority and collect tags
  priority=2  # default P2
  tags=()

  while IFS= read -r label_name; do
    [[ -z "$label_name" ]] && continue
    # Skip the filter label itself
    [[ "${label_name,,}" == "${LABEL,,}" ]] && continue

    p=$(priority_for_label "$label_name")
    if [[ -n "$p" ]]; then
      # Use highest priority (lowest number)
      if [[ $p -lt $priority ]]; then
        priority=$p
      fi
    else
      # Non-priority labels become tags
      tags+=("${label_name,,}")
    fi
  done <<< "$label_names"

  # Build task block
  task_line="- [ ] ${title}"
  metadata=""

  # ID from issue number
  metadata+=$'\n'"  - **ID**: issue-${number}"

  # Tags
  if [[ ${#tags[@]} -gt 0 ]]; then
    tag_str=$(IFS=,; echo "${tags[*]}" | sed 's/,/, /g')
    metadata+=$'\n'"  - **Tags**: ${tag_str}"
  fi

  task_block="${task_line}${metadata}"

  # Add to priority bucket
  case $priority in
    0) P0_TASKS+=("$task_block") ;;
    1) P1_TASKS+=("$task_block") ;;
    2) P2_TASKS+=("$task_block") ;;
    3) P3_TASKS+=("$task_block") ;;
  esac
done

# Generate output
generate() {
  echo "# Tasks"
  echo "Spec v0.5"

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

if [[ -n "$OUTPUT" ]]; then
  generate > "$OUTPUT"
  echo "Wrote ${issue_count} issue(s) to ${OUTPUT}" >&2
else
  generate
fi
