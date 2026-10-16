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
  `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp` must each
  list `tasksmd/tasks.md` -> `publish.yml` (no environment). Without that rule the
  publish `PUT` 404s (`npm error 404 Not Found - PUT .../@tasks-md%2fparser`), as
  the v0.10.3 run did on 2026-10-01 after the repo was recreated. The owner sets
  all four once with `scripts/setup-npm-trusted-publishing.sh` (see below).
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
  A tooling failure (the cli did not install, has no `check-push`, or crashed)
  prints `claim-check could not run (cli/tooling problem)`, not the no-claim
  message. It fails closed when enforcing and warns when advisory. Only a
  `check-push` exit with a `rejected:` line counts as a missing claim.
- **The `tasks-snapshot` projection builds + runs the *local* cli**, not
  `npx @tasks-md/cli` (the generic `fleet init` form). Because this repo is the
  cli's own source, the published package is redundant and `npx` is subject to
  registry mirror lag right after a release (a fresh publish 404s / fails to
  install on CI). The workflow does `npm ci` + `npm run build` +
  `node packages/cli/dist/cli.js render`. `fleet init` skips existing files, so
  this intentional divergence survives a re-run. The render still skips
  gracefully on failure (temp-file swap), so it never truncates `TASKS.md`. The
  `tasks-claim-check` workflow keeps the generic `npx` form (it's advisory).

## Autonomous release

Standing approval from the owner on 2026-10-16: an agent may publish a
release to npm **without asking**, but only when every check below holds.
If any check fails, stop and report it. Do not work around it.

The owner does one thing once, in a real terminal (npm asks for 2FA):

```bash
npm login
bash scripts/setup-npm-trusted-publishing.sh
```

The script checks `npm whoami`, adds the `tasksmd/tasks.md` -> `publish.yml`
trusted publisher to each package, skips a package that already has it, and
reports (never revokes) a package that trusts something else. It stores no
token. Re-running it is safe.

### Preconditions (all must hold)

1. **Trust is set.** The queue has no open task for the owner's one-time
   `setup-npm-trusted-publishing.sh` run (`tasks list --json`).
2. **The version bump is merged.** A PR that ran
   `bash scripts/sync-versions.sh <version>` is merged to `main`, and every
   `packages/*/package.json` on `origin/main` has that version.
3. **The gate is green on `main`'s head.** In a fresh worktree at
   `origin/main`: `npm ci && npm run build && npm test && npm run lint` exits 0,
   and the latest `CI` run on that commit passed
   (`gh run list --branch main --workflow CI -L 1`).
4. **The version is new.** For each of the four packages,
   `npm view <pkg>@<version> version` prints nothing (not yet on npm), and the
   tag `v<version>` does not exist (`git ls-remote --tags origin v<version>`).

### Publish

```bash
sha=$(git rev-parse origin/main)          # the commit you just verified
gh release create "v<version>" --target "$sha" --generate-notes
gh run watch "$(gh run list --workflow publish.yml -L 1 --json databaseId -q '.[0].databaseId')" --exit-status
for p in @tasks-md/parser @tasks-md/lint @tasks-md/cli tasks-mcp; do npm view "$p" version; done
```

The release event runs `publish.yml`, which publishes through Trusted
Publishing (OIDC) with provenance. Every `npm view` must print `<version>`.

### Never

- Never use an npm token, and never publish from a laptop (`npm publish`
  stays human-only outside `publish.yml`).
- Never re-run a failed publish blindly. Read the run log first. A 404 on
  `PUT` means trust is missing: reopen the owner's setup task.
- Never unpublish to undo a bad release. Ship a fixed patch version.

After a release, bump `CLI_VERSION` in `.github/workflows/tasks-claim-check.yml`
when `check-push` changed.

