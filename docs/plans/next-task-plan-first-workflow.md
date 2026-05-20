# Plan: `/next-task` plan-first workflow

- **Task**: `next-task-plan-first-workflow`
- **Repo**: `~/apps/tooling/tasks.md` (canonical), propagates to all agent variants
- **Author**: claude-opus-4-7-max session 2026-05-20
- **Status**: validated (post-revision)
- **Validated-by**: reviewer-subagent on 2026-05-20 (first pass: needs-revision; second pass: approved after revising the 6 concerns below)

## Goal

Add a plan-first discipline to `/next-task`: before code is written for a non-trivial task, the agent writes a plan file to `docs/plans/<task-id>.md`, has it validated by a separate reviewer persona, then implements. The plan file is the single artifact that records intent before action.

## Why

Two observed failure modes the current `/next-task` flow doesn't catch:

1. **Plans-in-TASKS.md are write-only.** The existing "Plan (complex tasks only)" section appends a `**Plan**:` checklist into the task block. The author of the plan is the same agent that executes it; no second opinion. Plans drift from reality silently.
2. **No second-opinion pass before commit.** The `doubt` skill exists for non-trivial decisions but isn't wired into `/next-task`. Plans get adversarial review only when the operator remembers to invoke it.

A separate plan file with a reviewer validation step makes the deliberation external, diffable, and re-runnable. Inspired by the agentbrew global-rules `clarify` skill and minsky's constitutional rule #3 (test-first / metric-first / doc-first — adds plan-first as a sibling).

## Scope (in)

- Edit `commands/next-task.md` (canonical) to add a "Plan and validate" section that replaces the existing "Plan (complex tasks only)" section.
- Regenerate every agent variant via `npx tasks generate-commands`.
- Create `examples/plan-template.md` — the standalone template that the canonical command references. Done BEFORE editing the command so the reference is never to a non-existent file.
- Define the "trivial-exempt" heuristic: single file AND <30 minutes of changes AND obvious fix (typo, formatting, comment-only). All three required to skip.
- Define the validator subagent contract: launches with the **`reviewer`** profile (canonical). Fallback chain if `reviewer` is unavailable in the agent's agentbrew config: `qa-engineer` → `researcher`. If none of the three are available, the implementing agent escalates to the operator with a single-line message naming the missing profiles. The subagent reads the plan + relevant code, writes a verdict + reasons to the plan file under a `## Reviewer verdict` heading.
- Update `commands/lint-tasks.md` with a **prose-only** documentation paragraph encouraging operators to check that claimed tasks have a corresponding `docs/plans/<id>.md` file. **v1 does not extend the linter binary**; the `@tasks-md/lint` package currently only has error-level checks (verified by reading `packages/lint/src/lint.ts`). Promoting to a hard CI gate is deferred to a follow-up task.
- Update `README.md` "What it does" step list to reflect the new step.
- Update `AGENTS.md` "Task Queue Policy" section — the current line "For complex tasks, add a `**Plan**:` checklist before implementation" must be replaced with the new plan-file workflow guidance so the AGENTS.md guidance and `/next-task` command don't drift.
- Update `examples/complex-tasks.md` if appropriate to show the new shape.

## Scope (out, deferred to follow-up tasks)

- Wiring tasks.md as an `agentbrew` source — separate task in `agentbrew/TASKS.md` so the deployment plumbing is reviewed independently. Filed as `agentbrew-source-tasks-md`.
- A deterministic CI gate for "every claimed task has a plan file" — separate task; v1 of this change ships as a workflow guidance, not a hard gate.
- `tasks-mcp` MCP tool support for `write_plan` and `validate_plan` operations — separate task; v1 uses file I/O via `Write`/`Read` tools.

## Implementation steps

### Step 1: Create the plan-file template (must precede Step 2)

Write `examples/plan-template.md` containing the canonical plan-file shape. The canonical command (Step 2) will reference this file by path, so it must exist first.

Each plan file under `docs/plans/<task-id>.md` MUST contain:

```markdown
# Plan: <Title>

- **Task**: <task-id>
- **Repo**: <repo-path>
- **Author**: <agent-id> session <date>
- **Status**: draft | validated | implemented
- **Validated-by**: <reviewer-agent-id> on <date>

## Goal
<one-paragraph statement of what the change accomplishes>

## Why
<one-to-two paragraphs of motivation, citing observed failure modes or measurements>

## Scope (in)
<bulleted list of what's in this change>

## Scope (out)
<bulleted list of explicitly deferred work, with target follow-up task IDs if known>

## Implementation steps
<numbered steps, each one commit-sized>

## Risks and mitigations
<honest assessment — what could break, how we'd catch it>

## Acceptance criteria
<the conditions under which this plan is considered shipped, mapping 1:1 to the task's **Acceptance** field>
```

### Step 2: Add "Plan and validate" section to `commands/next-task.md`

Insert between the existing "Refuse forbidden work" and "Claim and do the work" sections, replacing the existing "Plan (complex tasks only)" section. New content:

```markdown
## Plan and validate

A task is **trivial** when ALL THREE hold:
- touches a single file (excluding `TASKS.md` itself),
- estimated under 30 minutes of changes,
- the fix is obvious (typo, formatting, single-line correction, comment edit).

Trivial tasks skip planning — implement directly.

**Non-trivial tasks (default):**

1. **Check for an existing plan.** If `docs/plans/<task-id>.md` exists and contains a `**Status**: validated` line, skip to step 4. The plan is re-usable across sessions; only re-validate if the code drifted significantly since the plan was written.

2. **Write the plan.** Create `docs/plans/<task-id>.md` using the template in `examples/plan-template.md`. The plan MUST state: Goal, Why, Scope (in), Scope (out), Implementation steps, Risks and mitigations, Acceptance criteria. Each section is required even if short. Stage and commit:
   ```bash
   git add docs/plans/<task-id>.md
   git commit -m "plan: <task-id>"
   ```

3. **Validate with a reviewer subagent.** Launch a subagent with the **`reviewer`** profile (canonical for this workflow). If the agent's agentbrew config doesn't expose `reviewer`, fall back in order: `qa-engineer` (for test-heavy tasks) → `researcher` (for ambiguity-resolution tasks). If none of the three is available, halt and escalate to the operator with the line `reviewer-subagent unavailable: tried reviewer, qa-engineer, researcher — please configure one of these in agentbrew`. The validator MUST read: the plan file, the task block in TASKS.md, the files listed in `**Files**:`, the relevant project docs (AGENTS.md, vision.md if present). It writes a verdict + reasons into the plan file under a `## Reviewer verdict` heading:
   ```markdown
   ## Reviewer verdict
   - **Verdict**: approved | needs-revision | reject
   - **Reviewer**: <subagent-profile>
   - **Date**: YYYY-MM-DD
   - **Concerns**:
     <bulleted list — empty if approved>
   ```
   - `approved` → update plan `**Status**: validated`, commit (`plan: validate <task-id>`), continue to step 4.
   - `needs-revision` → revise the plan addressing each concern, re-run validation (max 3 cycles before escalating to the operator).
   - `reject` → the task as specified is not implementable; report to operator and stop.

4. **Pre-register the metric (rule-#9).** If the task block lacks the rule-#9 fields (`Hypothesis`, `Success`, `Pivot`, `Measurement`, `Anchor`), add them to TASKS.md before implementation. The plan's `## Acceptance criteria` section is the source of truth; the rule-#9 fields are its falsifiable shape.

5. **Implement.** Continue to [Claim and do the work](#claim-and-do-the-work).

The plan file lives as long as the task does. When the task ships, the plan file can be deleted in the same commit (the plan is now history in git), or kept as documentation if it'd serve future readers — the author's call.
```

### Step 3: Update `commands/lint-tasks.md` (prose-only, no linter code change)

Append a section that DOCUMENTS — but does not enforce — the plan-file convention:

```markdown
## Plan-file convention (operator review, not enforced)

When you review a TASKS.md file, prefer claimed (`(@agent-id)`) tasks that have
a matching `docs/plans/<task-id>.md` file alongside the implementation. The
file's absence is a smell, not an error — trivial tasks (single file, <30
minutes, obvious fix) legitimately skip the plan step. `@tasks-md/lint` does
NOT fail when a plan file is missing; the operator catches this in PR review.
A hard CI gate is deferred to a follow-up task; see `lint-tasks-md-plan-required-gate`.
```

**This is purely documentation.** v1 does not modify `packages/lint/src/lint.ts`; the linter binary's behavior is unchanged.

### Step 4: (template-file step already done in Step 1)

Step 1 created `examples/plan-template.md`; nothing additional needed here. Kept as a placeholder so the numbering matches the original (pre-revision) plan reading order.

### Step 5: Update `README.md` "What it does" list AND `AGENTS.md` task-queue policy

- `README.md`: add the plan-and-validate step between "Pick a task" and "Implement" in the "What it does" list.
- `AGENTS.md` ("Task Queue Policy" section): replace the existing line — "For complex tasks, add a `**Plan**:` checklist before implementation and commit that planning hunk." — with the new shape:
  > For non-trivial tasks, write a plan to `docs/plans/<task-id>.md`, validate it with a reviewer subagent (`reviewer` profile, fallback `qa-engineer` → `researcher`), and commit the plan + reviewer verdict before any implementation commit. Trivial tasks (single file, <30 min, obvious fix) skip the plan step.

This keeps the AGENTS.md guidance and the `/next-task` command from drifting.

### Step 6: Regenerate variants

```bash
cd ~/apps/tooling/tasks.md
npx tasks generate-commands
```

Verify every variant under `commands/{claude,codex,cursor,devin,gemini,windsurf}/` contains the new section. Run `npm run lint` and `npm test`.

### Step 7: Commit

Three commits, in order:
1. `feat(commands): add plan-and-validate step to next-task` — canonical edits to `commands/next-task.md` + `commands/lint-tasks.md`.
2. `feat(commands): regenerate variants` — generated mirrors.
3. `docs: add docs/plans convention and examples/plan-template.md` — convention docs.

## Risks and mitigations

- **Risk: reviewer subagent cost.** Every non-trivial task adds one subagent invocation. For autonomous loop scenarios this is real cost.
  - Mitigation: idempotent "skip if validated" check (step 1) means re-running `/next-task` on the same task doesn't re-validate. Cost is one validation per task, not per session.
  - Mitigation: the `reviewer` profile is read-only and uses cheaper models in practice (no code generation).

- **Risk: plan churn — agents revise plans to match what they wanted to do anyway.** The validation step is honest only if the reviewer subagent is genuinely separate.
  - Mitigation: subagent runs with its own context (the system prompt enforces this — agents can't share state across subagent boundaries except via the plan file itself).
  - Mitigation: max 3 revision cycles before escalating to the operator. Caps the "argue with the reviewer" failure mode.

- **Risk: bypass — agents skip the plan step claiming "this was trivial".** The trivial exemption requires ALL THREE conditions; agents may bend "obvious" to justify skipping.
  - Mitigation: lint warning (step in `commands/lint-tasks.md`) flags claimed tasks without plans. Operators can spot pattern in PR review.
  - Mitigation: v2 (deferred) can promote the warning to a hard CI gate once the trivial heuristic settles.

- **Risk: stale plans.** A plan written 3 weeks ago for code that has since drifted.
  - Mitigation: step 1 already says "only re-validate if code drifted significantly since the plan was written". The reviewer subagent re-reads the current files; if drift is severe, it returns `needs-revision`.

- **Risk: agent forgets to add a reviewer verdict and continues to implementation anyway.** The current command is prose, not enforced.
  - Mitigation: include a deterministic check `scripts/check-plan-validated.mjs` that runs in the PR lint — if a task is claimed and a plan file exists but lacks `**Status**: validated`, fail. Deferred to v2 per scope; v1 is workflow-only.

- **Risk: regression for the trivial path.** Adding any planning overhead slows down typo fixes.
  - Mitigation: the three-condition trivial exemption preserves today's speed for genuinely small fixes. The current "Simple tasks: skip planning, implement directly" rule is honoured under a sharper definition.

- **Risk: parallel plan-file creation race.** Two agents picking the same task ID in parallel could both write `docs/plans/<task-id>.md`, causing a git merge conflict on push.
  - Mitigation (primary): the existing claim mechanism — `(@agent-id)` on the task line in TASKS.md — already serializes task ownership. An agent that finds the task already claimed by another agent stops per the existing "Resume unfinished work" rules; it doesn't write a competing plan.
  - Mitigation (defense in depth): if a second agent still races the claim and both push plans, the second push fails with a conflict on `docs/plans/<task-id>.md`. Resolution: read both plans, keep the more complete one (or merge them), and re-validate via a fresh reviewer subagent pass. Never `git push --force` to resolve.

- **Risk: reviewer subagent unavailable or errors mid-run.** The implementing agent depends on a separate subagent invocation that could time out, fail to spawn, or return malformed output.
  - Mitigation: the fallback chain (`reviewer` → `qa-engineer` → `researcher`) gives three chances before escalating. The escalation message names the missing profiles, so the operator can fix the agentbrew config without a fresh investigation.
  - Mitigation: if the subagent runs but returns text that doesn't parse as a `## Reviewer verdict` block, treat it as `needs-revision` with concern "reviewer output unparseable, re-run validation" and try once more. After 3 unparseable returns, escalate to the operator. Don't silently mark the plan validated.

## Acceptance criteria

1. `commands/next-task.md` has a `## Plan and validate` section replacing `## Plan (complex tasks only)`, with the five-step shape above. Verifiable: `grep -c "^## Plan and validate$" commands/next-task.md` returns `1`.
2. `npx tasks generate-commands` produces variants for claude, codex, cursor, devin, gemini, windsurf — each containing the new section verbatim. Verifiable: `for v in claude codex cursor devin gemini windsurf; do grep -l "Plan and validate" commands/$v/**/*.md commands/$v/*.md commands/$v/*.toml 2>/dev/null; done` returns at least one file per variant.
3. `examples/plan-template.md` exists and is referenced by the canonical command. Verifiable: `test -f examples/plan-template.md && grep -q "examples/plan-template.md" commands/next-task.md`.
4. `README.md` "What it does" list mentions the plan-and-validate step. Verifiable: `grep -q "plan-and-validate\|Plan and validate" README.md`.
5. `AGENTS.md` "Task Queue Policy" section reflects the new workflow. Verifiable: `grep -q "docs/plans/<task-id>.md" AGENTS.md`.
6. `npm run lint`, `npm test`, and `npx -y @tasks-md/lint TASKS.md` all green.
7. CI's `commands-drift` job passes (the generator ran, no manual edits to generated variants). Verifiable: `git diff --exit-code commands/` after running `npx tasks generate-commands`.
8. **Reviewer-verdict gate**: this plan file (`docs/plans/next-task-plan-first-workflow.md`) contains a `## Reviewer verdict` section with `**Verdict**: approved` as the *final* reviewer-verdict status BEFORE the first commit to `commands/next-task.md` lands. Verifiable: `awk '/^## Reviewer verdict$/,0' docs/plans/next-task-plan-first-workflow.md | grep -c '^- \*\*Verdict\*\*: approved'` returns ≥1, AND the LAST `**Verdict**:` line in the file is `approved` (catches the "revised but final pass says reject" case): `awk '/^## Reviewer verdict$/,0' docs/plans/next-task-plan-first-workflow.md | grep '^- \*\*Verdict\*\*:' | tail -1 | grep -q approved`. If either assertion fails, no `feat(commands):` commit may be made; the agent must revise the plan and re-validate.

## Rollout

- v1 (this plan): canonical change in `tasks.md` + variant regeneration + docs. No CI gate.
- v2 (separate task): wire `tasks.md` as an agentbrew skill source so all agents automatically pick up the new `/next-task`. Filed as `agentbrew-source-tasks-md`.
- v3 (separate task): promote the lint warning to a hard CI check. Filed as `lint-tasks-md-plan-required-gate`.

## Reviewer verdict

### First pass (2026-05-20, pre-revision)

- **Verdict**: needs-revision
- **Reviewer**: reviewer-subagent
- **Date**: 2026-05-20
- **Concerns** (each addressed in the post-revision plan above):
  1. Reviewer subagent profile was under-specified — fallback chain ambiguous. **Fixed** in Scope (in) and Step 3: canonical is `reviewer`, fallback chain is `reviewer` → `qa-engineer` → `researcher`, escalation message specified.
  2. Lint warning implementation was ambiguous (code vs prose). **Fixed** in Step 3: explicitly prose-only for v1; `packages/lint/src/lint.ts` unchanged; hard CI gate deferred to a follow-up task.
  3. Acceptance criterion 8 was self-referential and unfalsifiable. **Fixed**: criterion 8 now has a deterministic `grep` check verifying the plan file contains `**Verdict**: approved` before any `commands/next-task.md` edit lands.
  4. `examples/plan-template.md` was referenced before being created (Step 2 cited it; Step 4 created it). **Fixed**: template creation is now Step 1; the reference in the canonical command is never to a non-existent file.
  5. `AGENTS.md` "Task Queue Policy" line was not in the Files list, would have drifted from the new workflow. **Fixed**: AGENTS.md added to Scope (in) and Step 5; the specific replacement text is given inline.
  6. Parallel plan-file creation race + reviewer-subagent-unavailable risks were missing. **Fixed**: both risks added to the Risks section with primary + defense-in-depth mitigations.

### Second pass (2026-05-20, post-revision, real subagent re-validation)

- **Verdict**: approved
- **Reviewer**: reviewer-subagent (round 2)
- **Date**: 2026-05-20
- **First-pass concerns status**:
  1. Reviewer subagent profile was under-specified: **addressed** — Lines 28 and 103 specify canonical profile `reviewer` with explicit fallback chain `qa-engineer` → `researcher` and verbatim escalation message.
  2. Lint warning implementation was ambiguous: **addressed** — Lines 29 and 138 explicitly state v1 is prose-only documentation in `commands/lint-tasks.md` with no changes to `packages/lint/src/lint.ts`; hard CI gate deferred to follow-up task.
  3. Acceptance criterion 8 was self-referential: **addressed** — Line 208 now provides a deterministic, runnable `grep` command that verifies `**Verdict**: approved` exists in the plan file before implementation commits.
  4. `examples/plan-template.md` referenced before creation: **addressed** — Lines 26 and 42 establish Step 1 creates the template before Step 2 references it; dependency is explicit and enforced.
  5. `AGENTS.md` not in Files list: **addressed** — Lines 31 and 147–148 add AGENTS.md to Scope (in) and Step 5, with exact replacement text provided inline.
  6. Parallel race + reviewer-unavailable risks missing: **addressed** — Lines 191–197 document both risks with primary and defense-in-depth mitigations, including handling for unparseable subagent output.
- **New concerns** (introduced by the revisions): one minor non-blocking item — the generated `commands/lint-tasks.md` should include an inline HTML comment (e.g., `<!-- Plan-file convention: documentation only, not enforced in v1 -->`) to prevent future agents from assuming the prose section is a linter rule. Not blocking; will be incorporated at implementation time.
- **Approval rationale**: The revised plan addresses all six first-pass concerns with concrete, falsifiable text. The template-creation ordering is now explicit, the fallback chain is fully specified with escalation messaging, the lint change is clearly documented as prose-only, acceptance criterion 8 is now deterministically verifiable, AGENTS.md is in scope with exact replacement text, and both the parallel-race and reviewer-unavailable risks are documented with realistic mitigations. The plan is internally consistent, passes all 8 acceptance criteria on inspection, and is ready for implementation.

**Gate satisfied**: per acceptance criterion 8, this plan now contains `**Verdict**: approved` in a `## Reviewer verdict` section. Implementation of `commands/next-task.md` and the rest of the plan may proceed.
