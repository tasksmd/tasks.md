#!/bin/bash
# Install /next-task command for detected agents.
# Usage: ./scripts/install.sh [target-dir] [--all | --agent NAME]
#
# Auto-detects which agent directories exist and copies the right command files.
# Reports what was installed and skips agents that aren't present.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${1:-.}"
FILTER_AGENT=""
INSTALL_ALL=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --all) INSTALL_ALL=true ;;
    --agent) shift; FILTER_AGENT="${2:-}" ;;
  esac
done

installed=0

install_agent() {
  local name="$1" src="$2" dst="$3"
  if [ -n "$FILTER_AGENT" ] && [ "$FILTER_AGENT" != "$name" ]; then
    return
  fi
  if [ -d "$(dirname "$dst")" ] || $INSTALL_ALL; then
    mkdir -p "$(dirname "$dst")"
    cp -r "$src" "$dst"
    echo "  ✓ $name → $dst"
    installed=$((installed + 1))
  fi
}

echo "Installing /next-task commands..."

# Claude Code
if [ -d "$TARGET_DIR/.claude" ] || $INSTALL_ALL; then
  install_agent "claude" \
    "$REPO_DIR/commands/claude/skills/next-task" \
    "$TARGET_DIR/.claude/skills/next-task"
fi

# Codex
if [ -d "$TARGET_DIR/.agents" ] || $INSTALL_ALL; then
  install_agent "codex" \
    "$REPO_DIR/commands/codex/skills/next-task" \
    "$TARGET_DIR/.agents/skills/next-task"
fi

# Cursor
if [ -d "$TARGET_DIR/.cursor" ] || $INSTALL_ALL; then
  install_agent "cursor" \
    "$REPO_DIR/commands/cursor/next-task.md" \
    "$TARGET_DIR/.cursor/commands/next-task.md"
fi

# Gemini CLI
if [ -d "$TARGET_DIR/.gemini" ] || $INSTALL_ALL; then
  install_agent "gemini" \
    "$REPO_DIR/commands/gemini/next-task.toml" \
    "$TARGET_DIR/.gemini/commands/next-task.toml"
fi

# Windsurf
if [ -d "$TARGET_DIR/.windsurf" ] || $INSTALL_ALL; then
  install_agent "windsurf" \
    "$REPO_DIR/commands/windsurf/next-task.md" \
    "$TARGET_DIR/.windsurf/workflows/next-task.md"
fi

echo ""
if [ $installed -eq 0 ]; then
  echo "No agent directories detected in $TARGET_DIR"
  echo "Use --all to install for all agents, or create agent dirs first."
else
  echo "✓ Installed for $installed agent(s)"
fi
