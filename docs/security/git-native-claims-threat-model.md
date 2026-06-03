# Threat model: git-native fleet claiming

> Companion to [`spec.md` § "Fleet coordination"](../../spec.md#fleet-coordination) and
> [`docs/plans/deterministic-fleet-claiming.md`](../plans/deterministic-fleet-claiming.md).
> This document is normative for the **security boundaries** of the git-native backend.
> It is deliberately honest about what v1 does **not** guarantee.

## Scope

The git-native backend coordinates a fleet (a team of machines × per-host agent fleets)
through an append-only event log on a `tasks-claims` git ref. That log, the generated
`TASKS.md` projection, the CI that regenerates it, and the local hooks that gate work are
all **security boundaries**, not mere implementation details. This document enumerates the
trust boundaries, the threats against them, and which mitigations are in v1 vs. deferred to
a later phase or left to operator policy.

**v1 is not unbypassably secure.** v1's enforcement is a *client-side* `pre-push` hook,
which a clone without the hook (or `git push --no-verify`) bypasses. The unbypassable
guarantee requires the **Phase 3** server-side required check (`fleet-phase3-server-side-enforcement`).
Read the "Status" column before relying on any single row.

## Trust boundaries

| # | Boundary | Trusted to… | NOT trusted to… |
|---|----------|-------------|-----------------|
| B1 | Local clone / working tree | hold a valid checkout | enforce anything a malicious local user wants to skip (`--no-verify`) |
| B2 | Agent process | act as its configured `actor-id`/`instance-id` | prove its identity cryptographically (v1 has no signing) |
| B3 | Git remote (the `tasks-claims` ref) | provide atomic non-fast-forward rejection (the CAS primitive) | order events by wall-clock or prevent a privileged user force-pushing |
| B4 | Generated `TASKS.md` PR | be a pure `fold(log)` projection from the single-writer job | be hand-edited as a way to change state (state lives in the log) |
| B5 | CI status check (path-scoped claim check) | reject non-markdown changes lacking a live claim + matching fencing token | run on untrusted forks with write-capable secrets |
| B6 | Repository ruleset / branch protection | forbid force-push/delete of `main` and `tasks-claims` | exist by default — it must be configured per repo |
| B7 | Optional server hook (`pre-receive`, GHE/GitLab/Gitea) | be the strongest, unbypassable gate | be available on github.com (no `pre-receive` there) |

## Threats → mitigations → status

| Threat | Mitigation | Status |
|--------|------------|--------|
| **Forged actor identity** — an agent claims under another's `actor-id` | `actor-id` is advisory in v1 (no signing); collision-freedom does not depend on identity truthfulness — the *fencing token* (B2/B5), not the name, gates work | v1: advisory. Signed identity = deferred follow-up |
| **Stale / stolen `claim_id` fencing token** — a resurrected owner pushes work after its claim lapsed | Work commits must carry `Task-Claim: <claim_id>` matching the **live** claim; a lapsed/replaced `claim_id` no longer matches and the check rejects | v1: client hook checks it. Phase 3: server check enforces it unbypassably |
| **Missing GitHub-actor → claim-owner mapping** — the pushing GitHub user ≠ the claim's `actor_id` | Phase 3 required check validates that the authenticated pusher maps to the live claim owner | Phase 3 (server). v1 does not bind GitHub identity to `actor_id` |
| **Force-push / delete of `tasks-claims`** — rewriting or dropping the log | Repository ruleset on the `tasks-claims` ref: no force-push, no deletion (B6). Append-only log means history is the audit trail | Requires operator-configured ruleset (B6). Documented, not automatic |
| **Replayed / edited log events** — re-pushing an old event or mutating one | `event_id` is unique; the fold keeps the first and ignores duplicates. Malformed/edited events are skipped by the fold, never abort it. Ruleset forbids history rewrite | v1: fold-level dedup + skip. Ruleset deferred to operator |
| **Malicious generated-snapshot PR** — a fake "projection" PR that smuggles non-doc changes | The projection job touches **only `TASKS.md`**; the path-scoped check passes it by the *same* docs-only rule as any human docs PR — no per-actor bypass. A PR touching code is gated regardless of who/what opened it | v1: path rule. Phase 3: server-enforced |
| **Local hook bypass** — `git push --no-verify` or a clone without lefthook | Acknowledged: client hooks are ergonomics, not a guarantee. The hard gate is the Phase 3 server required check + ruleset | **v1 limitation.** Mitigated only at Phase 3 |
| **Sleeping laptop holds a claim** — a dead/suspended owner never releases | Long `lease_expires` backstop lets another machine steal via CAS after TTL | v1: long lease. Heartbeats/short leases = Phase 2 (`fleet-phase2-leases-heartbeats-compaction`) |
| **PR-workflow injection** — attacker-controlled PR content reaches the claim-check workflow with write secrets | Claim-check workflows use `pull_request` (read-only `GITHUB_TOKEN`, no secrets on fork PRs), **never `pull_request_target`** (see CI guidance below) | v1 guidance; enforced when the Phase 3 workflow ships |
| **Raw-email leakage** — a git email rendered into the public `TASKS.md` | The projection renders the privacy-safe `actor-id`, never a raw email, unless the operator explicitly opts in (spec § Actor identity and privacy) | v1: privacy-safe by default |
| **`pull_request_target` misuse** — using the dangerous trigger for the claim check | Forbidden for untrusted claim checks (below) | v1 guidance |

## CI workflow guidance

The claim-check and projection workflows handle untrusted input (PR contents from any
contributor or fork). Therefore:

- **Use `on: pull_request`, never `on: pull_request_target`,** for the path-scoped claim
  check. `pull_request_target` runs with the base repo's secrets and write token against
  **attacker-controlled** head code — the canonical GitHub Actions injection vector. The
  claim check needs only to read the diff and the commit trailers, which `pull_request`
  (read-only token, no secrets on fork PRs) provides.
- **Never `actions/checkout` the PR head ref in a `pull_request_target` job and then run it.**
- The projection job runs on push to `tasks-claims` (a trusted internal ref), may use the
  bot token, and writes only `TASKS.md` — it does not execute PR-supplied code.
- Pin third-party actions by full commit SHA.

### Deliberate divergence: who builds the cli

Two generated workflows run `@tasks-md/cli`, and they resolve it **differently on purpose** — do not "unify" them:

| Workflow | Trigger | How it gets the cli | Why |
|----------|---------|---------------------|-----|
| `tasks-snapshot` (projection) | `repository_dispatch` / `workflow_dispatch` / `schedule` — all **trusted** | builds + runs the repo's **local** cli (`npm ci` + `npm run build` + `node packages/cli/dist/cli.js`) | the trigger code is always trusted base-repo code; build-local keeps it in sync with `main` and dodges registry mirror lag |
| `tasks-claim-check` | `pull_request` — **untrusted PR head** | runs the **published** cli (pinned to public npm): the `fleet init` template uses `npx -y @tasks-md/cli`; **this repo**, being the cli's own workspace (where `npx @tasks-md/cli` would resolve our unbuilt local package), installs the published cli into a temp dir outside the workspace and runs that | the PR head is attacker-controlled; building the local workspace cli would run the PR's own code, letting a malicious PR rewrite `check-push` to always pass and **bypass its own claim check** |

The claim-check must **never** run the local workspace build (`packages/cli/dist/cli.js`) on a `pull_request`. A regression-guard test (`packages/cli/src/commands/fleet.test.ts` → "claim-check never builds the untrusted PR's cli") fails CI if the live workflow or the `fleet init` template references `packages/cli/dist/cli.js`, and requires both to invoke the published `@tasks-md/cli`.

### Compaction force-pushes the log — the B6 ruleset must exempt the bot

Log compaction (`tasks fleet compact`, run by the projection past `COMPACTION_SUGGESTED_AT` events) rewrites `tasks-claims` to a fold-equivalent minimum and **force-pushes** it. This is safe against concurrent claims because it uses `git push --force-with-lease=refs/heads/tasks-claims:<oldTip>`: a claim landing in the fetch→push window advances the remote past the lease, the push is rejected, and compaction aborts (no clobber, retried next cycle) — so collision-freedom holds. But it **does** force-push. Therefore, when an operator arms a B6 ruleset that forbids force-push/delete of `tasks-claims` (as recommended for hard enforcement), that ruleset **must exempt the projection/compaction bot** — on github.com via the ruleset's `bypass_actors`, on GHE/GitLab via a `pre-receive` exception for that ref+actor. Without the exemption, every compaction lease-fails and the log never shrinks. This exemption is a required sub-step of arming enforcement (`arm-hard-claim-enforcement`).

## Token scope and platform differences

| Platform | Server-side enforcement | Notes |
|----------|------------------------|-------|
| **github.com** | Rulesets + a **required status check** (no `pre-receive`) | The path-scoped claim check is the required check; protect `main` and `tasks-claims` via a Ruleset. Token: a repo-scoped `GITHUB_TOKEN` is enough for the projection job; the claim check needs only read |
| **GitHub Enterprise** | `pre-receive` hook (strongest) + Rulesets | `pre-receive` runs server-side and is unbypassable; mirror the path logic there |
| **GitLab** | `pre-receive` (server hook) or push rules + protected branches | Protect `tasks-claims`; custom refs are not CI-visible, so use a branch |
| **Gitea** | `pre-receive` (server hook) + branch protection | Same path logic as the reference recipe |

## Server-side enforcement recipe (Phase 3)

The path rule is one shared primitive — `tasks check-push <paths...> --task <id> --claim <token>`
(backed by `checkWorkPush` in `git-native.ts`, proven by the `path-scoped-enforcement` +
`claim-fencing` conformance properties). Every enforcement surface calls it so they cannot drift:

- **github.com** — `tasks fleet init` generates `.github/workflows/tasks-claim-check.yml`
  (`on: pull_request`). It is **advisory by default**: a code change without a live claim emits a
  `::warning::` but exits 0, so it never red-X's a bootstrap PR, a docs PR, or an ordinary
  contribution. To arm hard enforcement, do **both**: set the repo variable
  `TASKS_CLAIM_ENFORCE=1` (`gh variable set TASKS_CLAIM_ENFORCE --body 1`) so the workflow exits
  nonzero on a missing claim, **and** make it a **required status check** on the `main` ruleset.
  Protect `main` + `tasks-claims` against force-push/delete (see the ruleset guidance the command prints).
- **GHE / GitLab / Gitea `pre-receive`** — same rule, server-side and unbypassable:

  ```bash
  #!/usr/bin/env bash
  # pre-receive: reject non-doc changes pushed without a live claim trailer.
  set -euo pipefail
  while read -r _old new ref; do
    [ "$ref" = "refs/heads/tasks-claims" ] && continue   # the log itself
    paths=$(git diff --name-only "$_old" "$new")
    task=$(git log -1 --format='%(trailers:key=Task,valueonly)' "$new" | head -1)
    claim=$(git log -1 --format='%(trailers:key=Task-Claim,valueonly)' "$new" | head -1)
    npx -y @tasks-md/cli check-push --task "$task" --claim "$claim" $paths || exit 1
  done
  ```

  `git log --format='%(trailers:...)'` uses git's own trailer parser (the `git interpret-trailers`
  engine), so authoring (`git commit --trailer`) and enforcement agree on the format.

## v1 mitigations vs. deferred

- **What client hooks catch (v1):** an honest agent that forgot to claim; a stale
  `claim_id` on a work push; a code change with no `Task:`/`Task-Claim:` trailer — *as long
  as the hook is installed and not bypassed.*
- **What only Phase 3 server checks catch:** a `--no-verify` bypass; a clone without hooks;
  a GitHub-actor ≠ claim-owner mismatch; an unbypassable code-without-claim rejection.
- **What remains operator policy:** configuring the Ruleset/branch protection (B6), enabling
  the required check, choosing whether to opt into raw-email rendering, and deciding the
  lease TTL.

## Cross-references

- Phase 3 enforcement requirements (`fleet-phase3-server-side-enforcement`) trace to threats
  **B5/B7** (path-scoped required check + `pre-receive`) and the fencing-token rows above.
- Phase 2 lease/heartbeat work (`fleet-phase2-leases-heartbeats-compaction`) traces to the
  "sleeping laptop" row.
- Privacy-safe actor rendering is specified in [`spec.md` § "Actor identity and privacy"](../../spec.md#fleet-coordination).
