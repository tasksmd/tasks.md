import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDocsContract, checkUserStories, h2Headings, REQUIRED_HEADINGS, relativeLinks } from "./check-docs-contract.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "docs-contract-"));
  mkdirSync(join(root, "docs"));
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return root;
}

const GOOD_GUIDE = `# Guide\n\n${REQUIRED_HEADINGS.join("\n\ntext\n\n")}\n`;
const GOOD_README = "# X\n\n```bash\nnpx x\n```\n\n[docs](docs/README.md)\n";

test("this repo meets the docs contract", () => {
  assert.deepEqual(checkDocsContract(repoRoot), []);
  assert.deepEqual(checkUserStories(repoRoot), []);
});

test("a complete fixture passes", () => {
  const root = fixture({ "AGENTS.md": GOOD_GUIDE, "README.md": GOOD_README, "docs/README.md": "[a](a.md)", "docs/a.md": "# A" });
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  try {
    assert.deepEqual(checkDocsContract(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unmapped doc, a missing CLAUDE.md, and wrong sections all fail", () => {
  const root = fixture({ "AGENTS.md": "# Guide\n\n## Development\n", "README.md": "# X\n", "docs/README.md": "", "docs/a.md": "# A" });
  try {
    const errors = checkDocsContract(root).join("\n");
    assert.match(errors, /H2 sections must be/);
    assert.match(errors, /CLAUDE\.md must be a symlink/);
    assert.match(errors, /no row for docs\/a\.md/);
    assert.match(errors, /quickstart code block/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("helpers ignore fenced headings, URLs, and anchors", () => {
  assert.deepEqual(h2Headings("## A\n```md\n## Not\n```\n## B"), ["## A", "## B"]);
  assert.deepEqual(relativeLinks("[a](x.md#y) [b](https://x.dev) [c](#z) [d](../y/)"), ["x.md", "../y/"]);
});

function storyFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "story-drift-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const STORY = (tests) => `# US\n\n> I want x.\n\n- **Metric**: wrong picks: 0\n- **Tests**: ${tests}\n`;

test("stories that name a metric and existing tests pass", () => {
  const root = storyFixture({
    "docs/user-stories/01-a.md": STORY("`tests/e2e/us01-a.test.mjs` (happy, error)"),
    "docs/user-stories/02-b.md": STORY('`pkg/lint.test.ts` ("passes a file")'),
    "tests/e2e/us01-a.test.mjs": "// US01\n",
    "pkg/lint.test.ts": 'it("passes a file", () => {});\n',
  });
  try {
    assert.deepEqual(checkUserStories(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("story drift fails: no metric, a missing file, a renamed case, an unbound or unlisted e2e file", () => {
  const root = storyFixture({
    "docs/user-stories/01-a.md": "# US\n\n- **Tests**: `tests/e2e/us01-a.test.mjs`\n",
    "docs/user-stories/02-b.md": STORY('`pkg/gone.test.ts`, `pkg/lint.test.ts` ("renamed case")'),
    "docs/user-stories/03-c.md": STORY("`tests/e2e/us03-c.test.mjs`"),
    "tests/e2e/us01-a.test.mjs": "// US01\n",
    "tests/e2e/us03-c.test.mjs": "// no story id here\n",
    "tests/e2e/us04-d.test.mjs": "// US04\n",
    "pkg/lint.test.ts": 'it("passes a file", () => {});\n',
  });
  try {
    const errors = checkUserStories(root).join("\n");
    assert.match(errors, /01-a\.md: no `- \*\*Metric\*\*:` line/);
    assert.match(errors, /02-b\.md: `pkg\/gone\.test\.ts` does not exist/);
    assert.match(errors, /02-b\.md: `pkg\/lint\.test\.ts` has no case "renamed case"/);
    assert.match(errors, /us03-c\.test\.mjs does not name US03/);
    assert.match(errors, /us04-d\.test\.mjs is not listed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
