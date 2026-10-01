#!/usr/bin/env bash
# Arm hard claim enforcement on a tasks.md dogfood repo — ONE action.
#
# Flips the claim-check CI from advisory -> blocking:
#   1. TASKS_CLAIM_ENFORCE=1  -> claim-check exits 1 (not just warns) on a code
#      change pushed with no live task claim.
#   2. a branch ruleset making `claim-check` a REQUIRED status check on the
#      default branch -> a failing claim-check actually blocks the merge.
#
# Requires repo ADMIN. Idempotent: safe to re-run.
#
# NOT done here (deliberately separate -- see the task
# `protect-tasks-claims-and-main-from-force-push`): force-push/delete protection
# of the tasks-claims ref. That ruleset MUST exempt the projection/compaction
# bot, which force-pushes the log with a lease; arming it naively would wedge
# compaction. It is a distinct hardening, not part of "arming".
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
echo "Arming hard claim enforcement on $repo"

# 1. enforce flag (gh variable set is idempotent)
gh variable set TASKS_CLAIM_ENFORCE --body 1 --repo "$repo"
echo "  done: TASKS_CLAIM_ENFORCE=1"

# 2. required-check ruleset (idempotent: skip if a same-named ruleset exists)
name="claim-check required"
if gh api "repos/$repo/rulesets" --jq '.[].name' 2>/dev/null | grep -qxF "$name"; then
  echo "  done: ruleset '$name' already present"
else
  gh api --method POST "repos/$repo/rulesets" --input - >/dev/null <<JSON
{ "name": "$name", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [ { "type": "required_status_checks", "parameters": {
    "strict_required_status_checks_policy": false,
    "required_status_checks": [ { "context": "claim-check" } ] } } ] }
JSON
  echo "  done: ruleset '$name' created (claim-check required on default branch)"
fi
echo "Armed. A code change with no live claim now fails claim-check and is blocked from merging."
