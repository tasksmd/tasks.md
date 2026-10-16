#!/usr/bin/env bash
# One-line contributor setup: install, build, test, lint, then the health check.
#
# Usage: bash scripts/setup.sh
#
# Idempotent and needs no sudo: re-running only re-installs from the lockfile
# and re-runs the checks. It ends with `tasks doctor`, so a broken install
# shows up now. Runs under macOS /bin/bash 3.2.
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 is missing. Install it: $2" >&2; exit 1; }
}

need node "https://nodejs.org (18 or newer)"
need npm "it ships with Node.js"
need git "https://git-scm.com"

step "npm ci"
npm ci

step "npm run build"
npm run build

step "npm test"
npm test

step "npm run lint"
npm run lint

if command -v lefthook >/dev/null 2>&1; then
  step "lefthook install (pre-commit lint + secret scan, pre-push claim check)"
  lefthook install
else
  echo "⚠ lefthook is missing, so git hooks are not installed. Fix: brew install lefthook && lefthook install"
fi
command -v gitleaks >/dev/null 2>&1 \
  || echo "⚠ gitleaks is missing; the pre-commit secret scan will fail. Fix: brew install gitleaks"

step "tasks doctor"
node packages/cli/dist/cli.js doctor
