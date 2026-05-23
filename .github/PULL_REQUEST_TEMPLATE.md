<!-- The pr-vision-trace CI gate parses this file's structure — keep the
section headers and bullet shapes intact. -->

## Why needed

<one-paragraph explanation of motivation>

## What changed

<bullet list of substantive deltas; group by package (parser/lint/mcp/cli) or by surface (spec/commands/taskgrind)>

## Vision trace

- **Vision goal**: <e.g. "Spec first, packages second" (VISION.md § Strategy), capability id from ROADMAP.md, or `N/A — <reason ≥3 chars>`>
- **User story**: <e.g. "docs/user-stories/01-agents-know-what-to-work-on.md" or `N/A — <reason ≥3 chars>`>
- **Competitor prior art**: <competitor task-queue format + how it differs, or `N/A — no comparable spec`>

<!--
  Opt-out for non-substantive auto-commits:
  <!-- vision-trace: not-applicable — <reason ≥3 chars> -->
-->

## How to test manually

```bash
<commands a reviewer can run locally — e.g.>
npm run build
npm test
npm run lint
npx -y @tasks-md/lint TASKS.md
```

## Verification

- `npm run build` — <pass/fail>
- `npm test` — <pass/fail; note any pre-existing flakes like the sync-issues alias timeout>
- `npm run lint` — <pass/fail>

## Rollback

```bash
git revert <merge-commit>
```

<one line on revert safety; mention any spec-version implications if applicable>
