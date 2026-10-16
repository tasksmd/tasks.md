# Tasks

## P0

- [ ] tasks.md meets every new-project requirement (or waives it with a reason) (@claude)
  - **ID**: tasks-md-meets-every-new-project-requirement-or-waives-it-wi
  - **Tags**: requirements, agents, observability
  - **Details**: Outcome: tasks.md meets all 10 new-project required areas (vision, metrics, observability, user-stories, setup, e2e, self-improving, tasks, checkup, caching), each met, mapped in .agents/requirements.yaml, or waived with a reason. Audit 2026-10-16: path score 7/22 (31%); by intent 0 met, 6 partial, 4 missing (metrics, self-improving, checkup, caching). Ordered gaps: (1) add the 5 prereg fields to every task and turn on --require-prereg in npm run lint; (2) .gitignore: .env, .env.*, !.env.example, *.pem, *.key, .metrics/, plus a lefthook pre-commit secret scan; (3) VISION.md: numeric dated adoption goal, pivot, command, dated Kill criteria, refresh last_reviewed, drop the Windsurf/Devin line; (4) docs/metrics.md + scripts/metrics.sh: adoption (code search), npm weekly downloads per package, gate time, lint false-positive rate, each with goal/pivot/command, (stub) when no data; (5) one contributor setup command (npm ci, build, test, lint, tasks doctor) first in CONTRIBUTING; (6) end init --install output and the setup prompt with tasks doctor; (7) Metric: and Tests: lines per story plus a drift check in scripts/check-docs-contract.mjs; (8) stranger-install e2e from the packed CLI in an empty temp repo; (9) e2e for US06 and US10; (10) content-free JSONL events and error->story map for tasks watch, tasks-mcp, fleet claims (docs/observability.md); (11) a fix command on every doctor warn/fail line; (12) a repo-wide checkup command (npm run checkup: doctor, cached gate, metrics, open P0s, monthly audit-due); (13) caching: gate steps and workspace tests cached by input hash (Nx or Turborepo across packages/*), full rerun on any change, NO_CACHE=1 forces; (14) timed gate steps + speed review inside the checkup; docs/learnings.md (predicted vs observed); (15) docs/decisions/ ADRs (git-native dogfood, backend plugins); (16) CHANGELOG generated at release. Push back already accepted: keep root VISION.md and tasks doctor (map them); JSONL logs only for long-running parts; no external error reporter; lint fixture tests (not e2e) for writing-guidance stories US02/US08.
    - **Hypothesis**: meeting the areas makes contributor and agent work measurable; the setup score rises from 7/24 (29%) to 100% (mapped or waived honestly).
    - **Measurement**: bash ~/.claude/skills/new-project/scripts/check-setup.sh . --profile tool
    - **Success**: 100% with every waiver reasoned, and the monthly audit finds no new gap.
    - **Pivot**: an area that costs more than it returns here becomes a waiver or a requirement-change PR on agentbrew new-project.
    - **Anchor**: agentbrew skill-plugins/workflow/new-project/references/owner-practices.md and requirements-map.md; audit 2026-10-16.

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
