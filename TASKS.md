# Tasks

## P0

## P1

- [ ] Owner runs scripts/setup-npm-trusted-publishing.sh once (@tasks-md)
  - **ID**: land-0-10-3-version-bump-and-claim-check-cli-pin
  - **Tags**: release, ci, human-only
  - **Details**: One-time owner step so publish.yml can publish through npm Trusted Publishing (the v0.10.3 run 404'd on PUT: no trust rule after the repo was recreated). In a real terminal: cd ~/apps/tooling/tasks.md && git pull && npm login && bash scripts/setup-npm-trusted-publishing.sh. It is idempotent and stores no token. Then complete this task (tasks complete land-0-10-3-version-bump-and-claim-check-cli-pin); that is precondition 1 of docs/release-and-ci.md 'Autonomous release'. The old 0.10.3 bump is superseded: main is at 0.11.0.
    - **Hypothesis**: one owner run of the trust script lets publish.yml publish through npm Trusted Publishing; the publish failure rate drops from 1/1 (the v0.10.3 404 on PUT) to 0.
    - **Measurement**: gh run list --workflow publish.yml --limit 1 --json conclusion -q '.[0].conclusion' after the next release
    - **Success**: the next publish.yml run concludes success with no npm token in the repo.
    - **Pivot**: if the run still 404s after the script ran, stop retrying and file an npm support ticket; switch to a manual publish checklist.
    - **Anchor**: npm docs 'Trusted publishing for npm packages' (2025); docs/release-and-ci.md Autonomous release.
  - **Blocked**: human-only — npm login needs the owner's browser 2FA in a real terminal; agents cannot do it.

- [ ] Release v0.11.0 and pin the claim-check CLI to it
  - **ID**: release-v0-11-0-and-pin-the-claim-check-cli-to-it
  - **Tags**: release, ci
  - **Details**: After the owner's trust setup (land-0-10-3-version-bump-and-claim-check-cli-pin) is done, follow docs/release-and-ci.md 'Autonomous release' to publish v0.11.0 (package.json is already 0.11.0). Then change CLI_VERSION in .github/workflows/tasks-claim-check.yml from 0.10.0 to 0.11.0 in a PR with Task/Task-Claim trailers. Verify: curl -s https://registry.npmjs.org/@tasks-md/cli | jq -r '."dist-tags".latest' prints 0.11.0.
    - **Hypothesis**: publishing v0.11.0 and pinning the claim check to it makes CI use the current check-push; the CLI version lag in tasks-claim-check.yml drops from 1 minor (0.10.0) to 0.
    - **Measurement**: curl -s https://registry.npmjs.org/@tasks-md/cli | jq -r '."dist-tags".latest' and grep CLI_VERSION .github/workflows/tasks-claim-check.yml
    - **Success**: both print 0.11.0 and the claim-check job passes on the pin PR.
    - **Pivot**: if the publish fails twice with the trust rule in place, stop and keep the 0.10.0 pin; file a task with the run log.
    - **Anchor**: docs/release-and-ci.md Autonomous release; Forsgren, Humble, Kim 2018 (deployment frequency).
  - **Blocked by**: land-0-10-3-version-bump-and-claim-check-cli-pin

- [ ] Make the README setup map honest and give stories outcome metrics (@claude)
  - **ID**: make-the-readme-setup-map-honest-and-give-stories-outcome-me
  - **Tags**: requirements, docs, observability
  - **Details**: Follow-up from the independent grade of tasks-md-meets-every-new-project-requirement-or-waives-it-wi. (1) map.setup named CONTRIBUTING.md, but the requirement is "first in the README": the README first block is the one-prompt setup, which still ends with tasks-lint, not tasks doctor (README and docs/user-stories/10 copies were missed when commands/setup.md changed). End both copies with `npx -y @tasks-md/cli doctor`, add a contributor pointer to `bash scripts/setup.sh` near the top, and map setup to README.md + scripts/setup.sh. (2) Six story metrics count passing e2e tests; replace US03, US04, US05, US07 with outcome rates from the local event log (docs/observability.md), keep test-count guards only where no event exists. (3) Re-render the TASKS.md snapshot.
    - **Hypothesis**: the setup map then truly meets "one command, first in the README, ending with the doctor", and stories with an outcome metric rise from 4/10 to 8/10.
    - **Measurement**: head -60 README.md (first block ends with tasks doctor) and grep -c "events.jsonl" docs/user-stories/0*.md
    - **Success**: the first README block names tasks doctor; 4 stories cite an events.jsonl rate; npm run lint and check-setup.sh stay green.
    - **Pivot**: if the README prompt cannot end with the doctor without hurting the landing page, waive setup with that reason instead.
    - **Anchor**: agentbrew new-project SKILL.md (setup row); Basili et al. 1994 (GQM).

## P2

- [ ] Rebuild the UI to the Hallmark design skill
  - **ID**: hallmark-design
  - **Details**: The owner chose Hallmark (nutlope/hallmark, installed through agentbrew on
    2026-10-27) as the design skill for every app with a UI. Run `/hallmark audit docs/index.html` first
    and save its report. Then `/hallmark redesign docs/index.html`: it keeps content and wiring and
    changes only the look. Keep the comfort budget from `ui-ux-rankings`
    (references/comfort-patterns.md) as the floor, and keep every existing UI test green.
  - **Files**: `docs/index.html`
  - **Acceptance**: the Hallmark audit reports no Floor failures and no Reflex gate left
    without a recorded reason; the `ui-ux-rankings` comfort gates still pass on phone and
    desktop, light and dark; before/after screenshots in the PR.
  - **Hypothesis**: Hallmark Floor and Reflex findings on `docs/index.html` drop from the audit baseline
    to 0 open, with no comfort-budget regression.
  - **Measurement**: `/hallmark audit docs/index.html` (count of Floor + Reflex findings) plus the repo's
    `ui-ux-rankings` gate.
  - **Success**: 0 Floor findings, every Reflex finding fixed or overruled with a reason.
  - **Pivot**: the redesign breaks a comfort gate or an everyday job takes more taps: keep the
    audit fixes only and drop the redesign.
  - **Anchor**: Nielsen 1994 (heuristic evaluation).

- [ ] Protect tasks-claims and main from force-push/delete (with compactor exemption)
  - **ID**: protect-tasks-claims-and-main-from-force-push-delete-with-co
  - **Tags**: git-native, security, enforcement
  - **Details**: Split out of arm-hard-claim-enforcement (which is now done: TASKS_CLAIM_ENFORCE=1 + a required claim-check ruleset). This is the SEPARATE threat-model B6 hardening: a ruleset on the tasks-claims ref (and main) blocking force-push + deletion, so the append-only log/history can't be rewritten to bypass the gate. CRITICAL: the tasks-claims rule MUST exempt the projection/compaction bot — compaction force-pushes the log with --force-with-lease, so a naive no-force-push rule would wedge compaction (log never shrinks). Use a ruleset bypass actor for the bot, or scope the rule to exclude lease-guarded pushes. gh api rulesets POST, idempotent. Not urgent: the primary gate (required claim-check) is already armed; this is defense-in-depth against a malicious-insider history rewrite. Surfaced arming enforcement.
    - **Hypothesis**: a non-fast-forward rule on tasks-claims with a compactor exemption blocks history rewrites; protected rewrite paths rise from 2/3 (main force-push, claims delete) to 3/3 with compaction still working.
    - **Measurement**: gh api repos/tasksmd/tasks.md/rulesets --jq '.[].name' and a lease-guarded tasks fleet compact dry run
    - **Success**: all 3 rules active and one compaction run succeeds under them.
    - **Pivot**: if no bypass actor works without a long-lived PAT, keep 2/3 and document the residual risk in the threat model.
    - **Anchor**: docs/security/git-native-claims-threat-model.md B6; GitHub docs 'About rulesets'.
  - **Blocked**: needs-user-decision — DONE: main force-push+delete (ruleset 24311973) + tasks-claims deletion (24311989), so the log can't be nuked and main can't be rewritten. REMAINING + BLOCKED: tasks-claims force-push (non-fast-forward) rewrite protection. GitHub 422-rejects the github-actions bot (app 15368) as a ruleset bypass actor even on this org repo ('must be part of the ruleset source or owner organization'), so the compactor can't be exempted; arming non_fast_forward without the exemption wedges compaction at the 5000-event threshold (the log is far below it, so no live impact yet). Unblock options: (a) an org-level Actions ruleset-bypass setting; (b) push tasks-claims from tasks-snapshot.yml via an admin PAT + bypass the Repository-admin role in the ruleset (introduces a long-lived PAT — your call). The fold already dedups replayed/edited events by event_id; only a dropped-event rewrite is unprotected.

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
    - **Hypothesis**: a short custom domain makes the site easier to share; the URL length drops from 30 characters (tasksmd.github.io/tasks.md/) to under 20.
    - **Measurement**: gh api repos/tasksmd/tasks.md/pages --jq .cname
    - **Success**: the custom domain serves the site over HTTPS.
    - **Pivot**: if no domain under 20 characters costs less than 20 USD a year, close this task and keep the github.io URL.
    - **Anchor**: GitHub docs 'Managing a custom domain for your GitHub Pages site'.
  - **Blocked**: needs-owner-decision-and-money — checked 2026-10-16: tasks.md is already registered by a third party (whois: created 1994-03-24, expires 2027-04-25, NS ns1.netim.net), so it cannot simply be bought. Owner picks and buys another domain (money + DNS). Repo part after that: add docs/CNAME with the domain, set it in Pages settings, add the DNS CNAME to tasksmd.github.io.

- [ ] tasks list --priority accepts an invalid priority silently
  - **ID**: tasks-list-priority-accepts-an-invalid-priority-silently
  - **Tags**: cli, bug
  - **Details**: `tasks list --priority P9` prints "No tasks match the filters." and exits 0. Reject values outside P0-P3 with exit 2 and the allowed values, matching the MCP list_tasks validation.
    - **Hypothesis**: validating the flag turns a silent empty result into a usage error; invalid-priority runs that exit 0 drop from 1 to 0.
    - **Measurement**: node packages/cli/dist/cli.js list --priority P9; echo $? (expect 2) plus a cli.test.ts case
    - **Success**: exit 2 for P9; lower-case input handled the same way as pick.
    - **Pivot**: if the MCP tool accepts other spellings, align both to one validator instead.
    - **Anchor**: docs/user-stories/07-monitor-queue-health.md; POSIX utility conventions.
