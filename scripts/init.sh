#!/bin/bash
# Initialize a TASKS.md task queue in the current repo.
# Usage: ./scripts/init.sh [--install]
#
# Creates TASKS.md with standard structure and optionally appends
# a Task Management section to AGENTS.md. With --install, also
# installs /next-task for detected agents.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${1:-.}"

# Strip flags from positional args
install_commands=false
for arg in "$@"; do
  case "$arg" in
    --install) install_commands=true ;;
  esac
done

# ── Create TASKS.md ───────────────────────────────────────────────
TASKS_FILE="$TARGET_DIR/TASKS.md"
if [ -f "$TASKS_FILE" ]; then
  echo "⊘ TASKS.md already exists — skipping"
else
  cat > "$TASKS_FILE" << 'EOF'
# Tasks

## P1

## P2

EOF
  echo "✓ Created TASKS.md"
fi

# ── Append to AGENTS.md ──────────────────────────────────────────
AGENTS_FILE="$TARGET_DIR/AGENTS.md"
if [ -f "$AGENTS_FILE" ]; then
  if grep -q "## Task Management" "$AGENTS_FILE" 2>/dev/null; then
    echo "⊘ AGENTS.md already has Task Management section — skipping"
  else
    cat >> "$AGENTS_FILE" << 'EOF'

## Task Management

- Read TASKS.md for available work before asking the user
- Claim tasks by appending (@your-agent-id) before starting work
- Remove completed tasks from the file (history is in git log)
- Commit TASKS.md changes separately from code changes
- Prioritize tasks that unblock other work
- Add new tasks you discover during implementation
EOF
    echo "✓ Added Task Management section to AGENTS.md"
  fi
else
  echo "⊘ No AGENTS.md found — skipping"
fi

# ── Install /next-task ────────────────────────────────────────────
if $install_commands; then
  bash "$SCRIPT_DIR/install.sh" "$TARGET_DIR" 2>/dev/null || echo "⚠ install.sh not found — skip command install"
fi

echo ""
echo "✓ Task queue initialized. Add tasks with:"
echo "  ## P1"
echo "  - [ ] Your first task"
