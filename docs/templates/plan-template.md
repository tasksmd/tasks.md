# Plan: <Title>

<!-- Template for docs/plans/<task-id>.md — copy and fill in.
     Required reading: commands/next-task.md § "Plan and validate".
     Every section heading below is required; sections may be short, but
     must not be omitted. The reviewer subagent will use missing sections
     as concerns. -->

- **Task**: <task-id (matches the `**ID**:` field in TASKS.md)>
- **Repo**: <repo-path>
- **Author**: <agent-id> session <YYYY-MM-DD>
- **Status**: draft | validated | implemented
- **Validated-by**: _(filled in after reviewer subagent run; format: `<reviewer-agent-id> on <YYYY-MM-DD>`)_

## Goal

<One-paragraph statement of what the change accomplishes — the operator-facing outcome, not the implementation. Match the task's title and **Details**.>

## Why

<One-to-two paragraphs of motivation. Cite observed failure modes, measurements, or constraints. Avoid hand-wavy "this would be nice" — if you can't name a specific failure mode or measurement the change improves, the task may not be ready for a plan.>

## Scope (in)

- <Bulleted list of every change this plan covers. Each bullet is concrete and one-commit-sized.>

## Scope (out)

- <Bulleted list of explicitly deferred work, with target follow-up task IDs if known. Anything obviously adjacent to the task that this plan does NOT touch belongs here so reviewers don't suggest adding it.>

## Implementation steps

### Step 1: <step title>

<Description. End each step with the verification command that proves the step succeeded.>

### Step 2: <step title>

<...>

<Add as many steps as the work needs. Each step should be one commit or one focused edit. Steps that don't naturally fit one commit are probably too large — split.>

## Risks and mitigations

- **Risk: <name>.** <One-sentence statement of what could go wrong.>
  - Mitigation: <How we'd prevent or detect it.>

<Enumerate at least 3 risks. If the section is empty, the plan hasn't been thought about hard enough. If the only risks are "the change might be wrong" — that's not a risk, that's the task. Risks are *specific* failure modes.>

## Acceptance criteria

1. <Falsifiable criterion #1, with the exact runnable check that verifies it.>
2. <Criterion #2 + check.>
3. <...>

<Every criterion must have a deterministic verification command. "It works" is not a criterion. "`npm test` exits 0 and `grep -c 'Foo' src/foo.ts` returns ≥1" is.>

## Reviewer verdict

<!-- Filled in by the reviewer subagent. Do not write here by hand unless you are
     the reviewer doing a real validation pass. The block must match the shape
     below so acceptance criterion 8 of the workflow change ("plan has approved
     verdict before code lands") can be checked deterministically. -->

- **Verdict**: <approved | needs-revision | reject>
- **Reviewer**: <subagent-profile>
- **Date**: <YYYY-MM-DD>
- **Concerns**:
  - <Bulleted list — empty list if approved.>
- **Suggested edits** (only if needs-revision):
  - <Specific changes to make.>
- **Approval rationale** (only if approved):
  - <2-3 sentences confirming why the plan is ready for implementation.>
