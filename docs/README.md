# Documentation map

Find the doc that answers your question. Rows are grouped by type
([Diátaxis](https://diataxis.fr/)): tutorials teach, how-to guides solve one
task, reference states facts, and explanation gives the why.

Audience: **human** = people who use or review tasks.md; **agent** = coding
agents that change this repo; **both** = either.

New top-level `docs/*.md` file? Add a row here in the same PR.
`scripts/check-docs-contract.mjs` (part of `npm run lint`) fails when a doc is missing.

This folder also holds the website (`index.html`, `template.html`, `style.css`).
`npm run build:site` generates `index.html`; do not edit it by hand.

## Start

| Doc | Answers | Audience |
|---|---|---|
| [`../README.md`](../README.md) | What is TASKS.md, and how do I add it to a repo? | human |
| [`../AGENTS.md`](../AGENTS.md) | How do I change this repo fast and safely? Commands, routing table, gotchas. | agent |
| [`../examples/`](../examples/) | What does a valid TASKS.md look like? | both |

## How-to guides

| Doc | Answers | Audience |
|---|---|---|
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How do I propose a change to the spec or the tools? | human |
| [`task-policy-snippet.md`](task-policy-snippet.md) | Which task-policy snippet do other repos copy into their `AGENTS.md`? | both |
| [`templates/`](templates/) | Which template do I copy for a task plan? | agent |
| [`../commands/README.md`](../commands/README.md) | How do I install and use `/next-task` and `/lint-tasks`? | both |

## Reference

| Doc | Answers | Audience |
|---|---|---|
| [`../spec.md`](../spec.md) | What exactly is the TASKS.md format, field by field? | both |
| [`editing-rules.md`](editing-rules.md) | What are the full editing rules, source boundaries, and task queue policy? | agent |
| [`observability.md`](observability.md) | Where are the logs, how do errors map to stories, and how do I check an install's health? | both |
| [`metrics.md`](metrics.md) | What do we measure, with which goal, pivot, and command? | both |
| [`release-and-ci.md`](release-and-ci.md) | Which release, CI, npm OIDC, and claim-check traps exist? | agent |
| [`security/`](security/) | What is the threat model for git-native claims? | both |
| [`../packages/cli/README.md`](../packages/cli/README.md) | Which commands does the `tasks` CLI have? | both |
| [`../packages/lint/README.md`](../packages/lint/README.md) | Which rules does the linter check? | both |
| [`../packages/mcp/README.md`](../packages/mcp/README.md) | Which tools does the MCP server expose? | both |
| [`../packages/parser/README.md`](../packages/parser/README.md) | What does the parser API return? | agent |

## Explanation

| Doc | Answers | Audience |
|---|---|---|
| [`../VISION.md`](../VISION.md) | Why does tasks.md exist, and what will it never do? | both |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | How do the spec, packages, and command generator fit together? | both |
| [`../ROADMAP.md`](../ROADMAP.md) | What is done and what comes next? | both |
| [`user-stories/`](user-stories/) | What should a user be able to do, with which metric? | both |
| [`competitors/`](competitors/) | How does TASKS.md compare with other task tools? | both |
| [`research/`](research/) | Spikes and research behind past decisions. | agent |
| [`blog/`](blog/) | Long-form posts about why agents need a backlog. | human |

## Work in progress and records

| Doc | Answers | Audience |
|---|---|---|
| [`plans/`](plans/) | Plans for non-trivial tasks, one file per task ID. | agent |
| [`human-blocked-actions/`](human-blocked-actions/) | Steps that need a human (npm logins, approvals). | human |
