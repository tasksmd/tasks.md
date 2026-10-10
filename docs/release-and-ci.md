# Release and CI gotchas

Read this before you change `.github/workflows/`, `scripts/sync-versions.sh`,
or the release process. It moved here from `AGENTS.md`.

The tag-triggered release (`.github/workflows/publish.yml`) and CI have sharp
edges that cost real debugging time — captured here so they don't recur:

- **npm OIDC Trusted Publishing needs npm >= 11.5.1.** Node 22 ships npm 10.x,
  which signs the provenance statement but **cannot authenticate the publish via
  OIDC** — the publish `PUT` 404s (`'<pkg>@<version>' is not in this registry`)
  even with a correct Trusted Publisher configured. The signature is: provenance
  signs, then 404 on PUT. `publish.yml` runs `npm install -g npm@latest` after
  `setup-node` for exactly this reason; do not remove it.
- **Trusted Publishers are configured per-package on npmjs.com**, not in the repo.
  `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp` each list
  `tasksmd/tasks.md` -> `publish.yml` (no environment). All four are set.
- **`publish.yml` never pushes to `main`.** The `main` rulesets (no
  non-fast-forward, required `claim-check`) reject a push from the release job.
  Bump versions in a PR with `bash scripts/sync-versions.sh <version>` before you
  tag. The workflow only checks the tag against `package.json` and stops before
  publishing on a mismatch.
- **`scripts/sync-versions.sh` must skip the private `@tasks-md/conformance`.**
  Bumping its cross-reference to `^<version>` makes `npm ci` try to fetch the
  unpublished package from the registry -> 404. It stays pinned `*` so it always
  resolves to the local workspace.
- **CI's `npm ci` may resolve through a registry mirror**, which can time out
  (`ETIMEDOUT`) on brand-new dependency versions that aren't mirrored yet (a fresh
  `yaml@2.9.0` broke CI this way — the workspaces config is now dependency-free
  JSON). Prefer mature, already-mirrored dependency versions; trust the GitHub
  Actions run over a local `npm view` (a registry mirror can lag the public registry).
- **`tasks-claim-check` is advisory by default** (warns, never blocks, so it never
  red-X's a bootstrap or docs PR) — but **armed on this repo**: `TASKS_CLAIM_ENFORCE=1`
  plus a required `claim-check` ruleset, so an unclaimed code PR is blocked. Re-arm
  here or on any dogfood repo in one action with `scripts/arm-enforcement.sh`. The
  workflow installs the published cli at a **pinned** `CLI_VERSION` (not `@latest`) so
  the required gate stays reproducible; bump it when `check-push` changes.
- **The `tasks-snapshot` projection builds + runs the *local* cli**, not
  `npx @tasks-md/cli` (the generic `fleet init` form). Because this repo is the
  cli's own source, the published package is redundant and `npx` is subject to
  registry mirror lag right after a release (a fresh publish 404s / fails to
  install on CI). The workflow does `npm ci` + `npm run build` +
  `node packages/cli/dist/cli.js render`. `fleet init` skips existing files, so
  this intentional divergence survives a re-run. The render still skips
  gracefully on failure (temp-file swap), so it never truncates `TASKS.md`. The
  `tasks-claim-check` workflow keeps the generic `npx` form (it's advisory).
