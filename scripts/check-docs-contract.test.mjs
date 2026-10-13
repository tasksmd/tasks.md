import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDocsContract, h2Headings, REQUIRED_HEADINGS, relativeLinks } from "./check-docs-contract.mjs";

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
