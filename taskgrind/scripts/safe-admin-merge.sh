#!/usr/bin/env bash
# scripts/safe-admin-merge.sh
#
# Rate-limited wrapper around `gh pr merge --admin`. Autonomous agents
# must use this instead of the raw command per taskgrind.md rule 7 +
# AGENTS.md "Task queue conventions". Enforces a 5-per-24h ceiling on
# self-authored admin merges to a shared master branch.
#
# Usage:
#   bash scripts/safe-admin-merge.sh <pr-number> [extra gh args...]
#
# Examples:
#   bash scripts/safe-admin-merge.sh 119 --squash
#   bash scripts/safe-admin-merge.sh --dry-run        # check rate only
#   ALLOW_ADMIN_BURST=1 bash scripts/safe-admin-merge.sh 119 --squash
#                                                     # human override
#
# After a successful merge, appends a one-line entry to
# `.agent-merge.log` (gitignored) for telemetry. The check script
# reads from `gh` directly, not the log — the log is informational
# only.
#
# Exit codes follow check-admin-merge-rate.mjs:
#   0  merge succeeded (or --dry-run passed)
#   1  rate limit exceeded; merge refused
#   2  data-fetch error; merge refused defensively
#   *  whatever `gh pr merge` returns on its own failures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${REPO_ROOT}/.agent-merge.log"
CHECK_SCRIPT="${SCRIPT_DIR}/check-admin-merge-rate.mjs"

# Dry-run: just check the rate, don't merge anything.
if [ "${1:-}" = "--dry-run" ]; then
  exec node "${CHECK_SCRIPT}"
fi

# Args sanity.
if [ -z "${1:-}" ]; then
  echo "[safe-admin-merge] Missing PR number." >&2
  echo "Usage: bash scripts/safe-admin-merge.sh <pr-number> [extra gh args...]" >&2
  exit 64  # EX_USAGE
fi

PR_NUMBER="$1"
shift

# Rate check (skip if human explicitly overrides).
if [ "${ALLOW_ADMIN_BURST:-}" = "1" ]; then
  echo "[safe-admin-merge] ALLOW_ADMIN_BURST=1 — skipping rate check (human override)." >&2
else
  if ! node "${CHECK_SCRIPT}"; then
    echo "" >&2
    echo "[safe-admin-merge] Rate check failed. Refusing to merge PR #${PR_NUMBER}." >&2
    exit 1
  fi
fi

# Run the merge with whatever extra args the caller passed.
gh pr merge "${PR_NUMBER}" --admin "$@"

# Log the merge. ISO 8601 UTC, PR number, author for audit.
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ME="$(gh api user --jq .login 2>/dev/null || echo unknown)"
echo "${TS}  ${ME}  pr=${PR_NUMBER}" >> "${LOG_FILE}"
echo "[safe-admin-merge] Merged PR #${PR_NUMBER}; logged to .agent-merge.log."
