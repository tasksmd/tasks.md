#!/bin/bash
# Generate agent-specific command files from the canonical source.
# Usage: ./scripts/generate-commands.sh
#
# Reads commands/next-task.md (canonical) and produces:
#   commands/claude/skills/next-task/SKILL.md
#   commands/codex/skills/next-task/SKILL.md
#   commands/cursor/next-task.md
#   commands/gemini/next-task.toml
#   commands/windsurf/next-task.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CANONICAL="$REPO_DIR/commands/next-task.md"

if [ ! -f "$CANONICAL" ]; then
  echo "Error: canonical source not found at $CANONICAL" >&2
  exit 1
fi

# ── Claude Code ───────────────────────────────────────────────────
generate_claude() {
  local body
  body=$(sed 's/{{AGENT_EXAMPLE}}/@claude-code, @claude-code-2/' "$CANONICAL")
  local out="$REPO_DIR/commands/claude/skills/next-task/SKILL.md"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'FRONTMATTER'
---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, LS
---
FRONTMATTER
  echo "" >> "$out"
  echo "$body" >> "$out"
  echo "  ✓ claude"
}

# ── Codex ─────────────────────────────────────────────────────────
generate_codex() {
  local body
  body=$(sed 's/{{AGENT_EXAMPLE}}/@codex, @codex-2/' "$CANONICAL")
  local out="$REPO_DIR/commands/codex/skills/next-task/SKILL.md"
  mkdir -p "$(dirname "$out")"
  cat > "$out" << 'FRONTMATTER'
---
name: next-task
description: Pick and work on the next task from TASKS.md. Use when the user says "next task", "work on the next thing", "what should I work on", or wants to start an autonomous coding loop.
---
FRONTMATTER
  echo "" >> "$out"
  echo "$body" >> "$out"
  echo "  ✓ codex"
}

# ── Cursor ────────────────────────────────────────────────────────
generate_cursor() {
  local body
  body=$(sed 's/{{AGENT_EXAMPLE}}/@cursor, @cursor-2/' "$CANONICAL")
  local out="$REPO_DIR/commands/cursor/next-task.md"
  mkdir -p "$(dirname "$out")"
  echo "$body" > "$out"
  echo "  ✓ cursor"
}

# ── Windsurf ──────────────────────────────────────────────────────
generate_windsurf() {
  local body
  body=$(sed 's/{{AGENT_EXAMPLE}}/@cascade, @cascade-2/' "$CANONICAL")
  local out="$REPO_DIR/commands/windsurf/next-task.md"
  mkdir -p "$(dirname "$out")"
  {
    cat << 'FRONTMATTER'
---
description: Pick and work on the next task from TASKS.md
---
FRONTMATTER
    echo ""
    echo "$body"
  } > "$out"
  echo "  ✓ windsurf"
}

# ── Gemini CLI ────────────────────────────────────────────────────
generate_gemini() {
  local body
  body=$(sed 's/{{AGENT_EXAMPLE}}/@gemini, @gemini-2/' "$CANONICAL")
  # Convert markdown body to a compact prompt for TOML
  local prompt
  prompt=$(echo "$body" | sed 's/^## //' | sed 's/^### //' | sed 's/```bash//' | sed 's/```markdown//' | sed 's/```//' | sed '/^$/d' | sed 's/^- \*\*/- /' | head -80)
  local out="$REPO_DIR/commands/gemini/next-task.toml"
  mkdir -p "$(dirname "$out")"
  {
    echo 'description = "Pick and work on the next task from TASKS.md"'
    echo ''
    echo 'prompt = """'
    echo "$prompt"
    echo '"""'
  } > "$out"
  echo "  ✓ gemini"
}

echo "Generating commands from canonical source..."
generate_claude
generate_codex
generate_cursor
generate_windsurf
generate_gemini
echo ""
echo "✓ All 5 command files generated from commands/next-task.md"
