# Tasks

## P0

- [ ] Restore npm release publishing for `v0.9.0` and future releases
  - **ID**: npm-release-publishing-blocker
  - **Tags**: release, deployment-infra, npm, ci, trusted-publishing, p0
  - **Details**: GitHub release `v0.9.0` exists, but publish workflow run `26844766304` failed at `npm publish --access=public --provenance` for `@tasks-md/parser@0.9.0` with `npm error code E404` / `404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`. npm latest remains `0.7.0` for all four packages. The previous `v0.8.0` token-based workflow run `26240628732` failed with the same package PUT E404, so the unblock is package-level npm authorization, not tests/build. Preferred fix: as an npm maintainer, configure trusted publishing for each package using `npm trust github <pkg> --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/`, or replace `NPM_TOKEN` with a package-scoped granular token that has read-write publish permission and bypasses 2FA. See `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`.
  - **Blocked**: needs-npm-maintainer-auth — npm package trust/access settings require maintainer auth for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; unauthenticated `npm trust list` returns E401 and the npm package access UI redirects to login.

## P1

## P2

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
domain for a cleaner URL.
  - **Blocked**: needs-user-approval — buying or configuring a public
domain/DNS and GitHub Pages custom domain is an external public action that
requires explicit current-session operator approval.

- [ ] Indent multi-line field values in the git-native TASKS.md projection
  - **ID**: indent-multi-line-field-values-in-the-git-native-tasks-md-pr
  - **Tags**: git-native, render, polish
  - **Details**: renderGitNativeSnapshot emits multi-line body/blocked values flush-left after the label (continuation lines are not indented). It lints clean but is non-idiomatic. Re-indent continuation lines under the field. Surfaced by the dogfood flip 2026-06-02.
