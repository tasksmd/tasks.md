#!/bin/bash
# Publish all packages to npm in dependency order (manual fallback).
# Prefer: create a GitHub Release tagged vX.Y.Z — the publish workflow handles the rest.
#
# Usage: scripts/publish-all.sh [--dry-run]
#
# Prerequisites:
#   npm adduser   (authenticate first)
#
# Order: @tasks-md/parser → @tasks-md/lint → tasks-mcp → @tasks-md/cli

set -euo pipefail

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

PACKAGES=(parser lint mcp cli)

echo "Publishing all packages to npm..."
echo ""

for pkg in "${PACKAGES[@]}"; do
  dir="packages/$pkg"
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")

  echo "── $name@$version ──"

  if npm view "$name@$version" >/dev/null 2>&1; then
    echo "  ⏭  Already published, skipping"
    echo ""
    continue
  fi

  if $DRY_RUN; then
    echo "  [dry-run] Would publish $name@$version"
    (cd "$dir" && npm publish --dry-run 2>&1 | sed 's/^/  /')
  else
    (cd "$dir" && npm publish --access=public)
    echo "  ✓ Published $name@$version"
  fi
  echo ""
done

echo "Done."
