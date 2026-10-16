#!/usr/bin/env bash
# One-time owner setup: let .github/workflows/publish.yml publish every
# tasks.md package to npm through Trusted Publishing (GitHub OIDC). After this,
# a published GitHub release publishes to npm with no token anywhere.
#
# Run it yourself in a real terminal: npm asks for 2FA in the browser.
#   npm login
#   bash scripts/setup-npm-trusted-publishing.sh
#
# Idempotent: a package that already trusts this repo + workflow is skipped.
# A package that trusts something else is reported, never revoked.
# It never reads, prints, or stores a token.
set -euo pipefail

REPO="tasksmd/tasks.md"
WORKFLOW="publish.yml"
PACKAGES=(@tasks-md/parser @tasks-md/lint @tasks-md/cli tasks-mcp)
REGISTRY="https://registry.npmjs.org"
MIN_NPM="11.15.0"
# Pause between trust writes; npm recommends it to avoid rate limiting.
SLEEP_SECONDS="${TRUST_SLEEP_SECONDS:-2}"

npm_version="$(npm --version)"
if [ "$(printf '%s\n' "$MIN_NPM" "$npm_version" | sort -V | head -1)" != "$MIN_NPM" ]; then
  echo "npm $npm_version is too old for 'npm trust'. Run: npm install -g npm@latest" >&2
  exit 1
fi

if ! user="$(npm whoami --registry "$REGISTRY" 2>/dev/null)"; then
  echo "Not logged in to npm. Run: npm login   (then re-run this script)" >&2
  exit 1
fi
echo "npm user: $user"

failed=0
for pkg in "${PACKAGES[@]}"; do
  if ! current="$(npm trust list "$pkg" --json --registry "$REGISTRY" 2>&1)"; then
    echo "✗ $pkg: npm trust list failed:" >&2
    echo "$current" >&2
    failed=1
    continue
  fi
  if grep -qF "$REPO" <<<"$current" && grep -qF "$WORKFLOW" <<<"$current"; then
    echo "✓ $pkg: already trusts $REPO ($WORKFLOW)"
    continue
  fi
  if grep -q '"id"' <<<"$current"; then
    # npm allows one trusted publisher per package. Do not revoke on our own.
    echo "✗ $pkg: trusts a different publisher. Inspect: npm trust list $pkg" >&2
    echo "  To replace it: npm trust revoke $pkg --id <id>, then re-run this script." >&2
    failed=1
    continue
  fi
  echo "→ $pkg: adding trusted publisher $REPO ($WORKFLOW)"
  npm trust github "$pkg" --file "$WORKFLOW" --repo "$REPO" --allow-publish -y --registry "$REGISTRY"
  sleep "$SLEEP_SECONDS"
done

echo
echo "Current trusted publishers:"
for pkg in "${PACKAGES[@]}"; do
  echo "== $pkg"
  npm trust list "$pkg" --registry "$REGISTRY" || failed=1
done
exit "$failed"
