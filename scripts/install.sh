#!/bin/bash
# Install /next-task command for detected agents and optional pre-commit hook.
# Usage: ./scripts/install.sh [target-dir] [--all | --agent NAME] [--hooks]
#
# Auto-detects which agent directories exist and copies the right command files.
# With --hooks, installs a pre-commit hook that validates staged TASKS.md files.
# Reports what was installed and skips agents that aren't present.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${1:-.}"
FILTER_AGENT=""
INSTALL_ALL=false
INSTALL_HOOKS=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --all) INSTALL_ALL=true ;;
    --agent) shift; FILTER_AGENT="${2:-}" ;;
    --hooks) INSTALL_HOOKS=true ;;
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
if [ $installed -eq 0 ] && ! $INSTALL_HOOKS; then
  echo "No agent directories detected in $TARGET_DIR"
  echo "Use --all to install for all agents, or create agent dirs first."
else
  echo "✓ Installed for $installed agent(s)"
fi

# ── Pre-commit hook ──────────────────────────────────────────────
if $INSTALL_HOOKS; then
  git_dir=$(git -C "$TARGET_DIR" rev-parse --git-dir 2>/dev/null || true)
  if [ -z "$git_dir" ]; then
    echo "⚠ Not a git repository — skipping hook install"
  else
    hooks_dir="$git_dir/hooks"
    hook_file="$hooks_dir/pre-commit"
    mkdir -p "$hooks_dir"

    # Marker to identify our hook content
    MARKER="# tasks-lint pre-commit hook"

    hook_body='#!/bin/bash
'"$MARKER"'
# Validates staged TASKS.md files before commit.
# Skip with: git commit --no-verify

staged_tasks=$(git diff --cached --name-only --diff-filter=ACM | grep -E "(^|/)TASKS\.md$" || true)

if [ -n "$staged_tasks" ]; then
  # Try npx tasks-lint first, fall back to local install
  if command -v tasks-lint >/dev/null 2>&1; then
    lint_cmd="tasks-lint"
  else
    lint_cmd="npx --yes tasks-lint@latest"
  fi

  errors=0
  for f in $staged_tasks; do
    if ! $lint_cmd "$f" 2>/dev/null; then
      errors=$((errors + 1))
    fi
  done

  if [ "$errors" -gt 0 ]; then
    echo ""
    echo "Fix TASKS.md issues or skip with: git commit --no-verify"
    exit 1
  fi
fi'

    if [ -f "$hook_file" ]; then
      if grep -q "$MARKER" "$hook_file" 2>/dev/null; then
        echo "⊘ Pre-commit hook already has tasks-lint — skipping"
      else
        # Append to existing hook (remove shebang from our addition)
        echo "" >> "$hook_file"
        echo "$hook_body" | tail -n +2 >> "$hook_file"
        echo "✓ Appended tasks-lint to existing pre-commit hook"
      fi
    else
      echo "$hook_body" > "$hook_file"
      chmod +x "$hook_file"
      echo "✓ Installed pre-commit hook: $hook_file"
    fi
  fi
fi
