#!/bin/bash
# Validate TASKS.md example files against the spec format
set -euo pipefail

errors=0
files_checked=0

error() {
  echo "ERROR: $1:$2: $3"
  errors=$((errors + 1))
}

validate_file() {
  local file="$1"
  local line_num=0
  local has_header=false
  local has_version=false
  local last_priority=-1
  local in_task=false

  files_checked=$((files_checked + 1))

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_num=$((line_num + 1))

    # Line 1: must be "# Tasks"
    if [[ $line_num -eq 1 ]]; then
      if [[ "$line" != "# Tasks" ]]; then
        error "$file" "$line_num" "first line must be '# Tasks', got '$line'"
      else
        has_header=true
      fi
      continue
    fi

    # Line 2: must be "Spec v0.5"
    if [[ $line_num -eq 2 ]]; then
      if [[ "$line" != "Spec v0.5" ]]; then
        error "$file" "$line_num" "second line must be 'Spec v0.5', got '$line'"
      else
        has_version=true
      fi
      continue
    fi

    # Priority headings must be P0-P3 and in order
    if [[ "$line" =~ ^##\ P([0-3])$ ]]; then
      local priority="${BASH_REMATCH[1]}"
      if [[ $priority -le $last_priority ]]; then
        error "$file" "$line_num" "priority heading P$priority out of order (after P$last_priority)"
      fi
      last_priority=$priority
      in_task=false
      continue
    fi

    # Reject invalid priority headings
    if [[ "$line" =~ ^##\ P[4-9] ]] || [[ "$line" =~ ^##\ P[0-9][0-9] ]]; then
      error "$file" "$line_num" "invalid priority heading '$line' (must be P0-P3)"
      continue
    fi

    # Top-level tasks must use unchecked checkbox
    if [[ "$line" =~ ^-\ \[x\]\  ]]; then
      error "$file" "$line_num" "completed task should be removed, not checked off"
      continue
    fi

    # Top-level tasks must be checkboxes
    if [[ "$line" =~ ^-\  ]] && [[ ! "$line" =~ ^-\ \[.\]\  ]]; then
      # Could be a non-task list item at top level — only flag if under a priority heading
      if [[ $last_priority -ge 0 ]]; then
        error "$file" "$line_num" "task must use checkbox format '- [ ]', got '$line'"
      fi
      continue
    fi

  done < "$file"

  if ! $has_header; then
    error "$file" "1" "missing '# Tasks' heading"
  fi
  if ! $has_version; then
    error "$file" "2" "missing 'Spec v0.5' version line"
  fi
}

# Find files to validate
target="${1:-examples}"
if [[ -d "$target" ]]; then
  for file in "$target"/*.md; do
    [[ -f "$file" ]] && validate_file "$file"
  done
elif [[ -f "$target" ]]; then
  validate_file "$target"
else
  echo "Usage: $0 [directory|file]"
  exit 1
fi

echo ""
echo "Checked $files_checked file(s), found $errors error(s)"

if [[ $errors -gt 0 ]]; then
  exit 1
fi
