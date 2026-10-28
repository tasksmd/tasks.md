# Plan: rebuild the UI to the Hallmark design skill

Task: `rebuild-the-ui-to-the-hallmark-design-skill` (P2).

## Hypothesis

- **Metric**: Hallmark Floor + Reflex findings on `docs/index.html`, counted by
  `node ~/.claude/skills/hallmark/scripts/sloplint.mjs docs/index.html --genre modern-minimal`.
- **Baseline**: 13 FAIL + 1 REFLEX (saved in `.hallmark/before.txt`).
- **Success**: 0 FAIL, and each REFLEX fixed or waived with a reason in the CSS stamp.
- **Pivot**: a comfort gate breaks (sideways scroll, text under 14 px, touch target
  under 44 px) on phone or desktop, light or dark: keep the audit fixes, drop the redesign.
- **Anchor**: Nielsen 1994 (heuristic evaluation).

## Steps

1. Save the audit baseline (`.hallmark/before.txt`, `.hallmark/before.json`).
2. Deal a theme (`theme.mjs deal`); picked Cobalt.
3. Scaffold `docs/tokens.css` and `docs/base.css`; rewrite `docs/style.css` on top.
4. Rewrite `docs/template.html` for the look only. Keep every section id, link and
   build placeholder (`{{QUICK_START}}`, `{{FORMAT_TABLE}}`, `{{INSTALL_TABLE}}`).
5. Rebuild `docs/index.html` with `npm run build:site`, then run sloplint until clean.
6. Take before/after screenshots with Playwright on phone and desktop, light and dark,
   and check the comfort budget in the same run.

## Copy changes (look only, no new claims)

- Dashes in copy become colons or commas.
- Straight quotes become typographic quotes.
- Headings move to sentence case. "FAQ" reads "Common questions".
- "Read →" reads "Read the post".
- The footer links are a list, not a middle-dot string.

## Out of scope

- The words of each section stay. The page stays long: sloplint keeps gate 58
  (word count) as a NOTE on a redesign, because a redesign keeps the content.
- The Hallmark render tier is not used: its puppeteer launch lacks the keychain
  flags this Mac requires. Playwright takes the screenshots instead.
