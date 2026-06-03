# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

- [ ] Restore npm release publishing for `v0.9.0` and future releases
  - **ID**: npm-release-publishing-blocker
  - **Tags**: release, deployment-infra, npm, ci, trusted-publishing, p0
  - **Blocked**: needs-npm-maintainer-auth — npm package trust/access settings require maintainer auth for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; unauthenticated `npm trust list` returns E401 and the npm package access UI redirects to login.
  - **Details**: GitHub release `v0.9.0` exists, but publish workflow run `26844766304` failed at `npm publish --access=public --provenance` for `@tasks-md/parser@0.9.0` with `npm error code E404` / `404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`. npm latest remains `0.7.0` for all four packages. The previous `v0.8.0` token-based workflow run `26240628732` failed with the same package PUT E404, so the unblock is package-level npm authorization, not tests/build. Preferred fix: as an npm maintainer, configure trusted publishing for each package using `npm trust github <pkg> --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/`, or replace `NPM_TOKEN` with a package-scoped granular token that has read-write publish permission and bypasses 2FA. See `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`.
  - **Files**: `.github/workflows/publish.yml`, `packages/*/package.json`, `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`
  - **Acceptance**: (a) each package has either a trusted publisher for `tasksmd/tasks.md` + `.github/workflows/publish.yml` with publish allowed, or the repo `NPM_TOKEN` secret is replaced by a valid publish-capable token; (b) rerunning the `v0.9.0` publish workflow or creating a replacement release publishes `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; (c) `npm view @tasks-md/parser version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/lint version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/cli version --registry=https://registry.npmjs.org/`, and `npm view tasks-mcp version --registry=https://registry.npmjs.org/` all return `0.9.0` or newer; (d) the release workflow's version-bump commit lands on `main`; (e) `npm run lint` and `npx -y @tasks-md/lint TASKS.md` pass.

## P1

## P2

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Blocked**: needs-user-approval — buying or configuring a public
    domain/DNS and GitHub Pages custom domain is an external public action that
    requires explicit current-session operator approval.
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
  - **Research**: 2026-05-02 — custom-domain setup notes
    Repo has no `CNAME` file. The current published URL appears in `README.md`
    as `https://tasksmd.github.io/tasks.md/`, and `scripts/build-site.js`
    generates `docs/index.html` from `docs/template.html`, `spec.md`, and
    `commands/`. Once domain ownership/configuration is approved, expect to add
    the GitHub Pages `CNAME` file or Pages setting, update the README website
    link, and rebuild `docs/index.html` if the rendered site needs the new URL.
    Approval needed before any domain purchase, DNS change, Pages custom-domain
    setting, or remote GitHub write.
  - **Files**: `README.md`, `scripts/build-site.js`, `docs/index.html`
  - **Acceptance**: Behind explicit operator approval for the external DNS / Pages change: a `CNAME` file (or the GitHub Pages custom-domain setting) points the site at the purchased domain; the README website link is updated to the new domain; `docs/index.html` is rebuilt via `npm run build:site` against the new URL; `npm run build:site` and `npx -y @tasks-md/lint TASKS.md` pass.
  - **Last-enriched**: 2026-05-02
