# Tasks

## P0

## P1

## P2

- [ ] Migrated owners can't retrieve their random fencing token to fence pushes
  - **ID**: migrated-owners-can-t-retrieve-their-random-fencing-token-to
  - **Tags**: git-native,migration,fencing,dx
  - **Details**: Now that migrated claims use a random claim_id (claim-migrated-<uuid>), the migrated owner never sees it — the migration created the claim, not 'tasks claim' (which is what prints the token). So once TASKS_CLAIM_ENFORCE is armed, a migrated owner cannot put the right Task-Claim trailer on their commit and check-push blocks their own legit push. This makes expose-claimid-and-assignee-in-list-json a PREREQUISITE for arming enforcement on a migrated repo (the owner must be able to look up their own token). Options: (a) implement token retrieval (expose-claimid...) and document it in the arm-hard-claim-enforcement checklist, and/or (b) let 'tasks claim <id>' by the current owner re-print the existing token without stealing. Surfaced fixing the guessable-token security bug.

- [ ] Protect tasks-claims and main from force-push/delete (with compactor exemption)
  - **ID**: protect-tasks-claims-and-main-from-force-push-delete-with-co
  - **Tags**: git-native,security,enforcement
  - **Details**: Split out of arm-hard-claim-enforcement (which is now done: TASKS_CLAIM_ENFORCE=1 + a required claim-check ruleset). This is the SEPARATE threat-model B6 hardening: a ruleset on the tasks-claims ref (and main) blocking force-push + deletion, so the append-only log/history can't be rewritten to bypass the gate. CRITICAL: the tasks-claims rule MUST exempt the projection/compaction bot — compaction force-pushes the log with --force-with-lease (#113), so a naive no-force-push rule would wedge compaction (log never shrinks). Use a ruleset bypass actor for the bot, or scope the rule to exclude lease-guarded pushes. gh api rulesets POST, idempotent. Not urgent: the primary gate (required claim-check) is already armed; this is defense-in-depth against a malicious-insider history rewrite. Surfaced arming enforcement.
  - **Blocked**: needs-user-decision — DONE: main force-push+delete (ruleset 17242285) + tasks-claims deletion (17242286), so the log can't be nuked and main can't be rewritten. REMAINING + BLOCKED: tasks-claims force-push (non-fast-forward) rewrite protection. GitHub 422-rejects the github-actions bot (app 15368) as a ruleset bypass actor even on this org repo ('must be part of the ruleset source or owner organization'), so the compactor can't be exempted; arming non_fast_forward without the exemption wedges compaction at the 5000-event threshold (currently ~150 events, so no live impact yet). Unblock options: (a) an org-level Actions ruleset-bypass setting; (b) push tasks-claims from tasks-snapshot.yml via an admin PAT + bypass the Repository-admin role in the ruleset (introduces a long-lived PAT — your call). The fold already dedups replayed/edited events by event_id; only a dropped-event rewrite is unprotected.

- [ ] claim-check conflates a tooling failure with a missing claim
  - **ID**: claim-check-conflates-a-tooling-failure-with-a-missing-claim
  - **Tags**: ci,enforcement,observability
  - **Details**: In tasks-claim-check.yml the guard is 'if [ -f tcli ] && node tcli check-push ...; then exit 0; fi' — so BOTH a tooling failure (install failed, or the pinned cli lacks the check-push command) AND a genuine no-claim rejection fall into the same enforce branch. With TASKS_CLAIM_ENFORCE=1 a tooling failure then prints '::error::code change without a live task claim' and exit 1 — a MISLEADING message that blocks the PR for the wrong reason (observed live: pinning CLI_VERSION to a stale 0.7.0 that predates check-push produced 'unknown command check-push' followed by the bogus no-claim error, PR #125). Fix: distinguish check-push's clean reject (a known nonzero exit code / sentinel) from any other failure (missing cli, unknown command, crash). On a tooling failure, emit a distinct '::error::claim-check could not run (cli/tooling problem)' and decide fail-open vs fail-closed deliberately rather than mislabeling it a claim violation. Bonus: a tiny pre-step asserting the pinned cli exposes check-push would catch a bad pin with a clear message. Surfaced fixing the pin.

- [ ] Fix Devin skill templates to use Bash permission patterns (@tasks-md)
  - **ID**: fix-devin-skill-templates-to-use-bash-permission-patterns
  - **Tags**: devin, cli
  - **Details**: Update migrate/next-task/setup skill templates and generate-commands.ts to match Devin Bash tool permission syntax.

- [ ] Adopt source-backed planning workflow (@tasks-md)
  - **ID**: adopt-source-backed-planning-workflow
  - **Details**: Update the canonical task planning workflow and templates to require source-backed evidence, explicit boundary contracts, and verifiable numbered work.

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
  - **Blocked**: needs-user-approval — buying or configuring a public
    domain/DNS and GitHub Pages custom domain is an external public action that
    requires explicit current-session operator approval.

- [ ] Decide projection-to-main snapshot freshness
  - **ID**: decide-projection-to-main-snapshot-freshness
  - **Tags**: git-native,projection
  - **Details**: The projection writes TASKS.md to the tasksmd/generated-snapshot branch and a human merges the PR, so main lags the live log until merged. Decide whether to auto-merge the snapshot PR, commit directly to main, or keep the manual gate, and document the chosen freshness contract in spec.md.

- [ ] Reclaim unreachable objects after compaction on self-hosted remotes
  - **ID**: reclaim-unreachable-objects-after-compaction-on-self-hosted-
  - **Tags**: git-native,compaction,ops
  - **Details**: Compaction force-pushes a rewritten tasks-claims ref; the dropped (completed-task) commits become unreachable but linger in the remote's object store until git gc. github.com auto-GCs periodically so clone/fetch cost still drops (clone only fetches reachable objects), but a self-hosted bare remote (GHE/GitLab/Gitea) needs periodic gc to actually reclaim disk. Document the recommended server gc cadence (or a post-compaction maintenance hint), and consider whether the projection should hint it. Surfaced implementing auto-trigger-git-native-log-compaction.

- [ ] Memoize foldLog per ref-tip within a process
  - **ID**: memoize-foldlog-per-ref-tip-within-a-process
  - **Tags**: git-native,performance
  - **Details**: readEvents is now O(1) git processes per fold (cat-file --batch), but several operations fold MORE THAN ONCE per process (e.g. claim does a check fold + appendWithRetry; render+stats+doctor each fold). Cache foldLog keyed on the current tasks-claims commit sha (currentClaimsCommit) so repeated folds in one process reuse the result; invalidate when the ref tip changes (after any append). Complements bound-git-native-fold-cost-at-scale (the read is cheap; this removes redundant reads). Surfaced implementing the batched readEvents.

- [ ] Fence cancel on the claim token for consistency
  - **ID**: fence-cancel-on-the-claim-token-for-consistency
  - **Tags**: git-native,fencing,consistency
  - **Details**: complete, release, update, and heartbeat all accept --claim and fence on it (reject a stale/foreign token); cancel is the only mutating git-native op without it. A foreign actor can cancel someone's claimed task. Add fenceCheck to the backend cancel() (no token → unfenced, as before) and a --claim option to the cancel CLI command, mirroring the complete/release/update pattern. Low-risk, non-breaking. Surfaced exposing the fencing token on complete/release/update.

- [ ] Report which events are corrupt, not just the count
  - **ID**: report-which-events-are-corrupt-not-just-the-count
  - **Tags**: git-native,observability,dx
  - **Details**: tasks doctor + fleet stats now report a corrupt-event COUNT (corruptEventCount), but not WHICH events/commits are malformed, so debugging a corrupt tasks-claims log still means manual git archaeology. Add a way to list the offending commit + path (e.g. tasks fleet doctor --verbose or a dedicated diagnostic) — readEvents already knows the spec (<commit>:<path>) of each blob it fails to parse; thread that out. Surfaced adding error+health visibility to the git-native backend.

- [ ] Document retrieving your claim token via list --json
  - **ID**: document-retrieving-your-claim-token-via-list-json
  - **Tags**: git-native,docs,dx
  - **Details**: list --json now surfaces claimId for the owner's claimed tasks (this PR), but nothing tells users that's how you re-obtain a lost token. The commands/next-task.md heartbeat note (added in the heartbeat PR) only says the token is printed by 'tasks claim'. Extend it (and/or README) to mention: retrieve it later with 'tasks list --json' (the claimId field on your claimed task). Regenerate the 6 command variants. Surfaced implementing expose-claimid-in-list-json. Note: this partially resolves migrated-owners-can-t-retrieve-their-random-fencing-token (retrieval now exists; that task's remaining half is documenting it in the arm-hard-claim-enforcement checklist).

- [ ] Guard against non-standard commit types prescribed in command docs
  - **ID**: guard-against-non-standard-commit-types-prescribed-in-comman
  - **Tags**: commands,ci,guardrail
  - **Details**: The plan: commit type prescribed by next-task.md was rejected by conventional-commit hooks (@commitlint/config-conventional) — a class of bug where the shared command docs prescribe a git commit -m subject whose type isn't in the conventional set (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert). Add a check (script or CI step, like commands-drift) that greps commands/ for prescribed 'git commit -m "<type>: ..."' / backtick-quoted '<type>: <id>' subjects and fails if <type> isn't a standard conventional type. Turns this one-off fix into a mechanical guard (feedback-loop-guardrails: every bug becomes a rule). Surfaced reconciling the plan: commit convention.

- [ ] Exclude dist from vitest so test files don't run twice
  - **ID**: exclude-dist-from-vitest-so-test-files-don-t-run-twice
  - **Tags**: testing,build,dx
  - **Details**: vitest is running compiled test copies under packages/*/dist/*.test.js in addition to the src *.test.ts (observed: packages/conformance/dist/conformance.test.js ran alongside the src one). This doubles conformance test time (~25s each) and risks a stale dist copy masking a src change. Add a vitest exclude for **/dist/** (or scope the test glob to src/) so each test runs once from source. Surfaced expanding conformance coverage.

- [ ] Finish README reorder: fundamentals before scaling; deep walkthrough after How It Works
  - **ID**: finish-readme-reorder-fundamentals-before-scaling-deep-walkt
  - **Tags**: docs,onboarding
  - **Details**: PR #126 reordered the top of the README (Highlights -> Installation -> format teaser) but left the mid-document order as-is (defensible but improvable). Two remaining order smells: (1) the 70-line 'Worked example: first 10 minutes' deep walkthrough sits before 'Why TASKS.md?' and 'How It Works' — move it AFTER 'How It Works' so the conceptual frame precedes the hands-on dive; (2) 'Writing Good Tasks' + 'The Format' (fundamentals) come after 'Backends' + 'Workspaces' (scaling/advanced) — consider moving the fundamentals up, or Workspaces down. Deferred from #126 to avoid risky large-block moves in the same PR as the install-gap fix. Files: README.md. Low risk, low urgency — the top (above-the-fold) order is already best-practice.
