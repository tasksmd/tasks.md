#!/bin/bash
# watch.sh — watch TASKS.md files and auto-lint on change
#
# Usage:
#   watch.sh [directory]    Watch directory (default: current dir)
#
# Requires: fswatch (brew install fswatch) or inotifywait (Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCH_DIR="${1:-.}"
WATCH_DIR="$(cd "$WATCH_DIR" && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

lint() {
  local file="$1"
  echo ""
  echo -e "${DIM}[$(date '+%H:%M:%S')] Change detected: $(basename "$file")${NC}"
  if node "$REPO_DIR/packages/lint/index.js" "$file" 2>&1; then
    echo -e "${GREEN}✓ No issues${NC}"
  else
    echo -e "${RED}✗ Lint errors found${NC}"
  fi
}

cleanup() {
  echo ""
  echo -e "${DIM}Stopped watching.${NC}"
  exit 0
}
trap cleanup SIGTERM SIGINT

# Find all TASKS.md files to watch
task_files=()
while IFS= read -r f; do
  task_files+=("$f")
done < <(find "$WATCH_DIR" -name "TASKS.md" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null)

if [ ${#task_files[@]} -eq 0 ]; then
  echo "No TASKS.md files found in $WATCH_DIR" >&2
  exit 1
fi

echo -e "${GREEN}Watching ${#task_files[@]} file(s) for changes:${NC}"
for f in "${task_files[@]}"; do
  echo -e "  ${DIM}${f}${NC}"
done
echo ""
echo -e "${DIM}Press Ctrl+C to stop.${NC}"

# Run initial lint
for f in "${task_files[@]}"; do
  lint "$f"
done

if command -v fswatch &>/dev/null; then
  fswatch --latency 1 --exclude '/\.git/' "${task_files[@]}" | while read -r changed; do
    case "$changed" in
      *TASKS.md) lint "$changed" ;;
    esac
  done
elif command -v inotifywait &>/dev/null; then
  while true; do
    changed=$(inotifywait -q -e modify,create --format '%w%f' "${task_files[@]}" 2>/dev/null)
    case "$changed" in
      *TASKS.md) lint "$changed" ;;
    esac
  done
else
  echo "Error: Neither fswatch nor inotifywait found." >&2
  echo "  macOS:  brew install fswatch" >&2
  echo "  Linux:  apt install inotify-tools" >&2
  exit 1
fi
