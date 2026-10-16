#!/usr/bin/env bash
# The repo gate, fast yet full: every step runs through Turborepo, which skips
# a step whose inputs (file contents, by hash) are unchanged and re-runs it on
# any change. Inputs per step are declared in turbo.json.
#
# Usage: bash scripts/check.sh [fast|full]     (default: full)
#   fast  build, test, lint                   (per commit)
#   full  fast + user-story e2e + secret scan (per PR)
#   NO_CACHE=1 bash scripts/check.sh          forces every step to run
#
# Each step's wall time and cache hits go to .metrics/events.jsonl (git-ignored);
# scripts/metrics.sh reads them and the checkup's speed review ranks them.
# Runs under macOS /bin/bash 3.2.
set -uo pipefail

cd "$(dirname "$0")/.."
mode="${1:-full}"
case "$mode" in fast|full) ;; *) echo "usage: check.sh [fast|full]" >&2; exit 2 ;; esac

export TURBO_TELEMETRY_DISABLED=1
export E2E_SKIP_BUILD=1
force=()
[ "${NO_CACHE:-0}" = 1 ] && force=(--force)

mkdir -p .metrics
events=.metrics/events.jsonl
now_ms() { node -e 'console.log(Date.now())'; }
log_event() { printf '%s\n' "$1" >> "$events"; }

gate_start="$(now_ms)"
failed=""
steps=0
cached_steps=0

# run_step <name> <command...>: time it, record cache hits, never stop the gate early.
# UNCACHED=1 marks a step that Turborepo does not cache (it is left out of the hit count).
run_step() {
  name="$1"; shift
  printf '\n==> %s\n' "$name"
  out="$(mktemp "${TMPDIR:-/tmp}/tasksmd-check.XXXXXX")"
  start="$(now_ms)"
  "$@" 2>&1 | tee "$out"
  rc="${PIPESTATUS[0]}"
  ms=$(( $(now_ms) - start ))
  # Turborepo prints "Cached:    N cached, M total".
  hits="$(sed -nE 's/^Cached: +([0-9]+) cached, ([0-9]+) total.*/\1 \2/p' "$out" | tail -1)"
  rm -f "$out"
  cached=false
  if [ -n "$hits" ] && [ "${hits% *}" = "${hits#* }" ] && [ "${hits% *}" != 0 ]; then cached=true; fi
  if [ "${UNCACHED:-0}" != 1 ]; then
    steps=$((steps + 1))
    [ "$cached" = true ] && cached_steps=$((cached_steps + 1))
  fi
  ok=true; [ "$rc" = 0 ] || { ok=false; failed="$failed $name"; }
  log_event "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"step\",\"mode\":\"$mode\",\"step\":\"$name\",\"ms\":$ms,\"ok\":$ok,\"cached\":$cached}"
  echo "--- $name: $([ "$ok" = true ] && echo ok || echo FAILED) in ${ms} ms$([ "$cached" = true ] && echo ' (cache hit)')"
}

turbo() { npx --no-install turbo run "$@" ${force[@]+"${force[@]}"} --output-logs=new-only; }

run_step build turbo build
run_step test turbo test
run_step lint turbo //#lint
if [ "$mode" = full ]; then
  run_step e2e turbo //#e2e
  if command -v gitleaks >/dev/null 2>&1; then
    # Commits on this branch only; the pre-commit hook covers staged files.
    base="$(git merge-base HEAD origin/main 2>/dev/null || true)"
    if [ -n "$base" ]; then
      UNCACHED=1 run_step secret-scan gitleaks git --redact --no-banner --log-opts="$base..HEAD"
    fi
  else
    echo "⚠ gitleaks is missing; the secret scan was skipped. Fix: brew install gitleaks"
  fi
fi

gate_ms=$(( $(now_ms) - gate_start ))
ok=true; [ -z "$failed" ] || ok=false
cached_all=false; [ "$cached_steps" = "$steps" ] && cached_all=true
log_event "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"gate\",\"mode\":\"$mode\",\"ms\":$gate_ms,\"ok\":$ok,\"steps\":$steps,\"cached_steps\":$cached_steps,\"cached_all\":$cached_all,\"forced\":$([ ${#force[@]} -gt 0 ] && echo true || echo false)}"

echo
if [ "$ok" = true ]; then
  echo "✓ gate ($mode) passed in ${gate_ms} ms; $cached_steps/$steps steps from cache"
else
  echo "✗ gate ($mode) failed:$failed (${gate_ms} ms). Re-run one step: npx turbo run <task> --force"
  exit 1
fi
