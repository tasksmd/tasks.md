# taskgrind — universal rules + scripts for autonomous coding sessions

A canonical rule set + 4 enforcement scripts for any repo running
autonomous overnight / 24h coding sessions ("taskgrinds").

The rules are designed to prevent the failure modes of unsupervised
autonomous agents: counter-update busywork, single-finding doc-drift
PRs, audit-cascade loops, and admin-merge volume on shared branches.

> **Reference deployment**: the rules + scripts here were extracted
> from a real autonomous-grind incident on
> [`oncall-hub-api`](https://github.intuit.com/expertnetwrk-portal/oncall-hub-api)
> on 2026-04-24. A 22-session run shipped 19 PRs but the queue was
> flat for 7 of 10 hours — the agent kept finding micro-doc-drift
> instead of substantive work. PRs #112, #115 directly violated the
> "no counter updates" rule; PRs #110, #111, #114, #117 each fixed a
> single docs-only finding; ~15 admin self-merges landed on master
> with no review. The rules below are anchored to those specific
> failures.

## What's here

| File | What it does |
|---|---|
| [`prompt-template.md`](prompt-template.md) | Canonical taskgrind prompt template. Copy to your repo's `taskgrind.md` and fill in the `{{REPO_NAME}}`/`{{REPO_CONTEXT}}` placeholders. The 10 hard rules are universal; the "Repo-specific rules" section is where you add your own |
| [`scripts/check-zero-ship-streak.mjs`](scripts/check-zero-ship-streak.mjs) | Pre-flight stop check — prints `STOP` or `CONTINUE` based on commit history + TASKS.md state. The canonical `next-task` skill calls it at session entry |
| [`scripts/check-admin-merge-rate.mjs`](scripts/check-admin-merge-rate.mjs) | Counts your admin self-merges in the trailing 24h via `gh pr list`. Exits non-zero at ≥5 |
| [`scripts/safe-admin-merge.sh`](scripts/safe-admin-merge.sh) | Wrapper around `gh pr merge --admin` that runs the rate check first. Logs successful merges to `.agent-merge.log` (gitignored) for audit |
| [`scripts/lint-pr-shape.mjs`](scripts/lint-pr-shape.mjs) | CI gate. Refuses single-finding docs-only PRs that don't close a task. Wire into GH Actions and Jenkins |

## Adoption — three options

### Option A: copy the scripts (simplest, fully owned)

```bash
# In your repo:
mkdir -p scripts
cp ~/path/to/tasks.md/taskgrind/scripts/*.mjs scripts/
cp ~/path/to/tasks.md/taskgrind/scripts/*.sh scripts/
chmod +x scripts/safe-admin-merge.sh
cp ~/path/to/tasks.md/taskgrind/prompt-template.md taskgrind.md
# Edit taskgrind.md to fill in placeholders
```

You own the copies; updates require re-copy. Tradeoff: drift over
time, but no version dependency.

### Option B: symlink to a checkout (lightest, most up-to-date)

```bash
# Clone tasks.md once on your machine, then in each adopting repo:
mkdir -p scripts
ln -s ~/path/to/tasks.md/taskgrind/scripts/check-zero-ship-streak.mjs scripts/
ln -s ~/path/to/tasks.md/taskgrind/scripts/check-admin-merge-rate.mjs scripts/
ln -s ~/path/to/tasks.md/taskgrind/scripts/safe-admin-merge.sh scripts/
ln -s ~/path/to/tasks.md/taskgrind/scripts/lint-pr-shape.mjs scripts/
cp ~/path/to/tasks.md/taskgrind/prompt-template.md taskgrind.md
# Edit taskgrind.md to fill in placeholders
```

`git pull` in the canonical checkout updates every adopting repo.
Tradeoff: requires the canonical checkout to exist on every machine
that runs the scripts (CI included).

### Option C: vendor via npx + the @tasks-md/cli package (planned)

Future: `npx @tasks-md/cli taskgrind <subcommand>` will run the
gates without needing local scripts. Not yet implemented.
[Track here](TASKS.md) under any open task tagged `taskgrind-cli`.

## Wiring into CI

### GitHub Actions (every adopting repo)

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for lint-pr-shape merge-base

      - name: Lint PR shape
        if: github.event_name == 'pull_request'
        run: node scripts/lint-pr-shape.mjs --base origin/${{ github.base_ref }}
```

### Jenkins (if your repo uses MSaaS or similar)

```groovy
// Jenkinsfile
stage('Validate PR shape') {
    when {
        beforeOptions true
        changeRequest()
    }
    steps {
        container('node') {
            sh '''
                git fetch origin "${CHANGE_TARGET:-master}" --depth=50 || true
                node scripts/lint-pr-shape.mjs --base "origin/${CHANGE_TARGET:-master}"
            '''
        }
    }
}
```

You'll need a `node` pod container (or runtime install). See
oncall-hub-api's [`KubernetesPods.yaml`](https://github.intuit.com/expertnetwrk-portal/oncall-hub-api/blob/master/KubernetesPods.yaml)
for the reference image (`docker.intuit.com/oicp/standard/node/debian11-node21:1.3.5`).

## Wiring the next-task skill

The canonical [`next-task` skill](../commands/next-task.md) (and its
6 agent-specific variants) already calls
`scripts/check-zero-ship-streak.mjs` at session entry per
[`commit c974804`](https://github.com/tasksmd/tasks.md/commit/c974804).
If you've adopted the script (Option A or B), the skill will pick
it up automatically. The stop check follows the canonical
`**Blocked**` metadata field from the TASKS.md spec when it detects
fully blocked queues.

## Wiring the counter-precision rule

This one's vitest-specific. Copy
[`oncall-hub-api/server/counter-precision.test.ts`](https://github.intuit.com/expertnetwrk-portal/oncall-hub-api/blob/master/server/counter-precision.test.ts)
into your repo's tests directory and adjust the `SCAN_DIRS` array.
The regex (`\b\d{2,4}\s+(tests?|suites?|skills?|agents?|...)\b`) is
universal; the directories to scan are repo-specific.

For non-vitest test runners (jest, mocha, etc.) the logic ports
straightforwardly — it's a ~150-line file with no vitest-specific
dependencies beyond `describe`/`it`.

## Wiring `tasks-lint` into your lint chain

Add to your `package.json`:

```json
{
  "scripts": {
    "lint": "<your-existing-linter> && yarn lint:tasks",
    "lint:tasks": "tasks-lint TASKS.md"
  },
  "devDependencies": {
    "@tasks-md/lint": "^0.7.0"
  }
}
```

This makes TASKS.md spec violations fail CI alongside your code lint.

## The 10 rules at a glance

(Detailed versions in [`prompt-template.md`](prompt-template.md).)

1. No outbound communication (Slack/Jira/GitHub posts, MCP "create" actions)
2. No web-UI form submits (DevPortal/Jenkins config/Splunk dashboards)
3. No production touches
4. No destructive git
5. No destructive shell
6. No roaming to other repos
7. ≤5 admin self-merges per 24h
8. No counter updates (use `N+` form)
9. No single-finding doc-drift PRs (`closes <task-id>` or batch ≥3)
10. Stop when the audit cascade is exhausted

## Lessons learned (canonical seed)

The lessons below are the ones the rules above are anchored to. Add
your repo-specific lessons in your own `taskgrind.md`'s "Lessons
learned" section.

- **2026-04-24 grind** on `oncall-hub-api`
  (`taskgrind-2026-04-24-1856-oncall-hub-api-75142.log`):
  10h27m run, 19 PRs shipped, queue 28 → 14 in the first 3 hours
  then flat for 7. Failure modes that motivated rules 7–10:
  - **Rule 7** — ~15 admin self-merges in 12h with no reviewer,
    concentrated on master.
  - **Rule 8** — PRs #112 and #115 directly violated the global
    counter-precision rule (`800+/30+ → 833/32`, `713+ → 833`).
  - **Rule 9** — PRs #110, #111, #112, #114, #117 each fixed
    exactly one docs-only finding in one file.
  - **Rule 10** — 17 sessions ran after the queue first reached
    100% `**Blocked**` tasks. The orchestrator's `productive_zero_ship` and
    `diminishing_returns` warnings fired repeatedly and were
    ignored.

- **2026-04-26 implementation session** (this directory's source):
  the rules above were shipped to oncall-hub-api as PRs #118–#127
  + cross-repo `tasks.md#29`. The rules now bind their own author
  — the `safe-admin-merge.sh` wrapper correctly refused to let me
  merge a 6th PR, and the structural-change branch in
  `lint-pr-shape.mjs` was added because the naive "all-md = drift"
  rule wrongly failed PR #118 (which legitimately added the chore
  + canonical prompt). Self-consistency check: the system works.
