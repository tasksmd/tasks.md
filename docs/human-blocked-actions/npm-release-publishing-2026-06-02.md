# Human-blocked action: Restore npm publishing for tasks.md packages

**Status**: pending
**Filed**: 2026-06-02
**Agent**: Devin
**TASKS.md entry**: npm-release-publishing-blocker

## Why the action is required

The GitHub `v0.9.0` release was created from the merged `git-native` backend slice, but the `Publish to npm` workflow failed during the first package publish. npm latest remains `0.7.0` for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`, so users cannot install the released CLI/backend changes from npm. The failure is in package publish authorization, not in build or tests: the workflow completed install, build, and test before failing at `npm publish`. The same package PUT failure also affected the earlier `v0.8.0` release, so this blocks all current public package delivery.

## Why it cannot be avoided

Publishing these packages requires package-maintainer authorization on npm. The repository has a `publish.yml` workflow and a repo `NPM_TOKEN` secret, but both the old token-based workflow (`v0.8.0`) and the new OIDC/provenance workflow (`v0.9.0`) fail with the same npm package PUT `E404`. npm exposes trusted publisher management through `npm trust`, but even the read-only `npm trust list @tasks-md/parser --registry=https://registry.npmjs.org/` call returns `E401 Unauthorized` without maintainer auth. The npm package access page also redirects to login, so the setting cannot be inspected or changed anonymously. The package metadata shows maintainer `cbrwizard <fyodor@sent.com>`, and this agent is not locally authenticated to that npm account (`npm whoami` returns `ENEEDAUTH`). GitHub repo admin access cannot reveal or repair the existing `NPM_TOKEN` value because GitHub secrets are write-only. Creating another GitHub release or rerunning the workflow without changing npm-side authorization will repeat the same failure.

## Workarounds attempted

| Path | Tried | Outcome | Reason ruled out |
|---|---|---|---|
| Reuse existing token-based publish workflow | 2026-06-02 | Historical `v0.8.0` run `26240628732` failed at `npm publish` with `E404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`. | Existing `NPM_TOKEN` does not currently have effective publish permission for the package scope, or package settings disallow it. |
| Use current trusted-publishing workflow | 2026-06-02 | `v0.9.0` run `26844766304` minted provenance but failed at package PUT with the same `E404`. | Workflow shape/build/tests are not enough; npm-side trust or publish permission must be fixed. |
| Inspect trusted publisher state with npm CLI | 2026-06-02 | `npm trust list @tasks-md/parser --json --registry=https://registry.npmjs.org/` returned `E401 Unauthorized`. Same for `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`. | Read/list of package trust settings requires npm maintainer auth. |
| Inspect package access settings in npm web UI | 2026-06-02 | `https://www.npmjs.com/package/@tasks-md/parser/access` redirected to `/login?next=...`. | Package access settings require npm account login; no anonymous read path. |
| Use public npm package metadata | 2026-06-02 | `npm view @tasks-md/parser --registry=https://registry.npmjs.org/` works and shows latest `0.7.0`, maintainer `cbrwizard`, no `0.8.0`/`0.9.0`. | Public metadata can confirm failure but cannot change publisher/trust settings. |
| Use GitHub secrets API to inspect `NPM_TOKEN` | 2026-06-02 | `gh secret list --repo tasksmd/tasks.md --app actions` confirms `NPM_TOKEN` exists. | GitHub secrets are intentionally write-only; the current value cannot be read or validated without running a workflow, and the release workflow already proved it does not publish successfully. |
| Create another release tag | 2026-06-02 | Not attempted after evidence above. | Would retrigger the same publish failure until npm authorization changes. |

## Sources consulted

- **Dev Intelligence consult**: N/A — this is public npm package publishing, not an Intuit-internal upstream.
- **Documentation** (2026-06-02): npm trusted publishing docs via Context7. Required GitHub Actions configuration is package-side trusted publisher for repo `tasksmd/tasks.md`, workflow file `.github/workflows/publish.yml`, optional environment, plus `id-token: write` in workflow.
- **Documentation** (2026-06-02): `npm trust github --help` confirms the CLI equivalent: `npm trust github [package] --file [--repo|--repository] [--env|--environment] [--allow-publish]`.
- **Live observation**: `gh -R tasksmd/tasks.md run view 26844766304 --log-failed` shows `@tasks-md/parser@0.9.0` passed package build/tests, then failed at `npm publish --access=public --provenance` with `E404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`.
- **Live observation**: `npm view @tasks-md/parser version --registry=https://registry.npmjs.org/` returns `0.7.0`; `npm view @tasks-md/parser@0.9.0 version --registry=https://registry.npmjs.org/` returns no match.
- **Live observation**: Playwright loaded the public package page and confirmed `@tasks-md/parser` is public at `0.7.0`; navigating to `/package/@tasks-md/parser/access` redirected to npm login.
- **Code anchors**: `.github/workflows/publish.yml` is the release workflow. It syncs package versions from the release tag, builds/tests all packages, then publishes `parser`, `lint`, `mcp`, and `cli`.

## Exact action the human must take

Preferred trusted-publishing fix:

1. Log into npm as a maintainer of all four packages.
2. From any shell authenticated to `registry.npmjs.org`, run:

```bash
npm trust github @tasks-md/parser --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/ --yes
npm trust github @tasks-md/lint --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/ --yes
npm trust github @tasks-md/cli --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/ --yes
npm trust github tasks-mcp --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/ --yes
```

3. If npm reports an existing trust relationship, list and replace it:

```bash
npm trust list @tasks-md/parser --registry=https://registry.npmjs.org/
npm trust revoke @tasks-md/parser --id=<trust-id> --registry=https://registry.npmjs.org/
```

4. Repeat the list/revoke/create flow for `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`.

Fallback token fix:

1. Create a granular npm access token with read-write permission for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`, with 2FA bypass enabled if the package policy requires it.
2. Replace the GitHub Actions repository secret `NPM_TOKEN` in `tasksmd/tasks.md`.
3. If using token publishing instead of trusted publishing, update `.github/workflows/publish.yml` to pass `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step and open a PR for that change before rerunning a release.

## Verification after action

After the npm-side fix, rerun the failed release workflow or create a replacement release tag if rerun is not accepted by npm:

```bash
gh -R tasksmd/tasks.md run rerun 26844766304
gh -R tasksmd/tasks.md run watch 26844766304 --exit-status
npm view @tasks-md/parser version --registry=https://registry.npmjs.org/
npm view @tasks-md/lint version --registry=https://registry.npmjs.org/
npm view @tasks-md/cli version --registry=https://registry.npmjs.org/
npm view tasks-mcp version --registry=https://registry.npmjs.org/
```

Expected result: all four `npm view ... version` commands return `0.9.0` or newer, and the workflow commits the package version bump back to `main`.

## Pivot if the action fails

If trusted publishing remains broken after trust configuration, use a replacement granular token path and temporarily remove `--provenance` only if npm support confirms the package trust policy cannot support OIDC for this scope. If token publishing also fails with `E404`, contact npm support with the failing run URL, package names, maintainer account, and exact package PUT error because the package owner/trust state is inconsistent with the package metadata. If npm accepts some packages and rejects others, publish a follow-up release after aligning each package independently rather than partially shipping mixed versions.

## Resolution
