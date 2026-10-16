#!/usr/bin/env bash
# Run the user-story e2e tests against the CLI as a stranger installs it.
#
# Usage: bash scripts/e2e.sh [test-file...]
#
# Packs every workspace package with `npm pack`, installs all tarballs together
# into an empty temp prefix (third-party dependencies still come from the
# registry), then runs tests/e2e/*.test.mjs with TASKS_E2E_BIN pointing at the
# installed `tasks` binary. E2E_SKIP_BUILD=1 skips `npm run build`.
# Runs under macOS /bin/bash 3.2.
set -euo pipefail

cd "$(dirname "$0")/.."
root="$PWD"

[ "${E2E_SKIP_BUILD:-0}" = 1 ] || npm run build >/dev/null

work="$(mktemp -d "${TMPDIR:-/tmp}/tasksmd-e2e.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/pkgs" "$work/prefix"

for pkg in parser lint mcp cli; do
  npm pack --silent --workspace "packages/$pkg" --pack-destination "$work/pkgs" >/dev/null
done

(
  cd "$work/prefix"
  printf '{ "name": "stranger", "private": true }\n' > package.json
  npm install --silent --no-audit --no-fund "$work"/pkgs/*.tgz
)

export TASKS_E2E_BIN="$work/prefix/node_modules/.bin/tasks"
export TASKS_E2E_LINT_BIN="$work/prefix/node_modules/.bin/tasks-lint"
export TASKS_E2E_MCP_BIN="$work/prefix/node_modules/.bin/tasks-mcp"

if [ $# -gt 0 ]; then
  node --test "$@"
else
  node --test "$root"/tests/e2e/*.test.mjs
fi
