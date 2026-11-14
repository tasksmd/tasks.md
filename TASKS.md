# Tasks

## P0

## P1

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
  - **Blocked**: npm bug npm/cli#9969: OIDC exchange 404s for GitHub immutable subjects (forced on repos created after 2026-07-15). Owner chose staged token publish 2026-11-11. Next: owner adds repo secret NPM_TOKEN; agent PRs publish.yml OIDC-then-token staged publish + docs exception; rerun v0.11.0 publish; owner approves with 2FA; then re-pin CLI_VERSION 0.11.0; owner unpublishes cli 0.10.0-0.10.2.

- [ ] Find why the v0.11.0 publish gets 404 with the trust rule set
  - **ID**: find-why-the-v0-11-0-publish-gets-404-with-the-trust-rule-se
  - **Tags**: release, ci
  - **Details**: The v0.11.0 release exists on GitHub (tag on abf667a) but nothing is on npm. publish.yml run 43032668925 failed twice on 2026-11-11 at the first package: provenance signs, then 'npm error 404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser'. Checked the same day: npm trust list shows tasksmd/tasks.md + publish.yml with publish permission on all four packages; runner npm is 12.2.2; each package.json repository url is tasksmd/tasks.md; no NODE_AUTH_TOKEN is set. The log does not show the OIDC exchange result. Not ruled out: PR 48 moved publish.yml from actions/setup-node v4 to v7.1.0 and actions/checkout v4 to v7.0.1; npm@latest is unpinned. Next step: add a workflow_dispatch diagnostic to publish.yml that requests the GitHub OIDC token, calls the npm token exchange endpoint for one package, and prints only the HTTP status and error text (never the token); or run npm publish with --loglevel verbose. Then fix the cause and re-run the publish for the existing v0.11.0 release. Do not delete the release or the tag. Keep CLI_VERSION at 0.10.0 until npm has 0.11.0.
    - **Hypothesis**: the OIDC token exchange fails for a reason the log hides; exposing its status and fixing the cause moves the publish failure rate from 2/2 to 0.
    - **Measurement**: gh run list --workflow publish.yml --limit 1 --json conclusion -q '.[0].conclusion' and npm view @tasks-md/cli@0.11.0 version
    - **Success**: the publish run concludes success and npm view prints 0.11.0 for all four packages.
    - **Pivot**: if the exchange endpoint rejects a correct claim set twice, stop and open an npm support ticket with the status and message.
    - **Anchor**: npm docs 'Trusted publishing for npm packages' (2025); docs/release-and-ci.md Autonomous release.
  - **Blocked**: npm bug npm/cli#9969: OIDC exchange 404s for GitHub immutable subjects (forced on repos created after 2026-07-15). Owner chose staged token publish 2026-11-11. Next: owner adds repo secret NPM_TOKEN; agent PRs publish.yml OIDC-then-token staged publish + docs exception; rerun v0.11.0 publish; owner approves with 2FA; then re-pin CLI_VERSION 0.11.0; owner unpublishes cli 0.10.0-0.10.2.

## P2

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

- [ ] Apply to open-source AI maintainer programs when tasks.md has traction
  - **ID**: apply-to-open-source-ai-maintainer-programs-when-tasks-md-ha
  - **Tags**: funding, ai-cost, owner-action
  - **Details**: Some vendors give open-source maintainers free AI. Research on 2026-11-10 found that tasks.md misses every published threshold, so applying now is a long shot. Recheck when the repo grows. Programs and rules as read on 2026-11-10 (reread each page before acting):
    - Claude for Open Source (https://claude.com/contact-sales/claude-for-oss): 6 months of the top Claude plan, paid billing pauses. Any one of: 20 or more external contributors with merged PRs in 12 months, 200,000 or more monthly downloads, 500 or more dependent repos, OpenSSF criticality 0.4 or above. It also has a discretionary "apply anyway" track.
    - OpenAI Codex for Open Source (https://developers.openai.com/codex/community/codex-for-oss): 6 months of ChatGPT Pro plus API credits. No numeric rule; it wants a "widely used public project".
    - Greptile for open source (https://www.greptile.com/pricing/open-source): free AI review, automatic at 50 stars.
    - Atlas Cloud OSS program (https://atlascloud.ai/docs/en/oss-program): monthly credits from about 100 stars.
    - GitHub Copilot Pro for maintainers: automatic for a "popular" repo; check https://github.com/settings/copilot.
    - No application needed on a public repo: CodeRabbit and Sourcery free AI review, Sentry for Open Source (includes Seer).
    - npm downloads of the tasks.md packages count toward the 200,000 monthly downloads rule.
    - **Hypothesis**: once tasks.md passes one threshold, one accepted application removes 6 months of AI subscription cost for the owner.
    - **Measurement**: `gh api repos/tasksmd/tasks.md -q .stargazers_count` and `gh api repos/tasksmd/tasks.md/contributors -q length`
    - **Success**: at least one program accepts and the benefit is active on the owner's account.
    - **Pivot**: if two applications made after a threshold is met are both rejected, close this task and stop applying.
    - **Anchor**: Anthropic Claude for Open Source program terms (https://www.anthropic.com/claude-for-oss-terms); Basili, Caldiera and Rombach (1994), GQM.
  - **Blocked**: needs-traction-and-owner-application — 2026-11-10: tasks.md is below every threshold. Agents never submit applications or forms; the owner applies. Unblock when the measurement shows 50 or more stars or 20 or more contributors, or when the owner chooses to try the discretionary tracks.

- [ ] Tidy public wording: registry mirror note and conduct contact
  - **ID**: tidy-public-wording-registry-mirror-note-and-conduct-contact
  - **Tags**: docs, oss
  - **Details**: Two small in-tree items from the 2026-11-10 open-source safety audit. (1) .github/workflows/tasks-claim-check.yml line 35 names a specific registry-mirror product in a comment; AGENTS.md, docs/release-and-ci.md, .github/workflows/tasks-snapshot.yml and packages/cli/src/commands/fleet.ts say 'registry mirror'. Use the generic wording everywhere. (2) CODE_OF_CONDUCT.md line 59 sends private conduct reports to an address on the tasks.md domain, which a third party owns (see set-up-github-pages-custom-domain). Replace it with a contact the owner controls, for example GitHub private vulnerability reporting or the owner's public address. The owner picks the contact.
    - **Hypothesis**: a conduct contact the owner controls means a private report reaches the maintainer; contact addresses on domains the project does not own drop from 1 to 0.
    - **Measurement**: grep -c '@tasks.md' CODE_OF_CONDUCT.md
    - **Success**: the command prints 0 and npm run lint passes.
    - **Pivot**: if the owner wants no email contact, point the section at GitHub's report-abuse flow and close the task.
    - **Anchor**: Contributor Covenant 2.1, Enforcement section; GitHub docs 'Adding a code of conduct to your project'.
