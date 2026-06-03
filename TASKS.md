# Tasks

## P0

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

- [ ] Auto-refresh the tasks-snapshot projection on claim push
  - **ID**: auto-refresh-the-tasks-snapshot-projection-on-claim-push
  - **Tags**: git-native,projection
  - **Details**: The push:[tasks-claims] trigger is impossible on github.com Actions (orphan log branch has no workflows), so the projection now runs on schedule + workflow_dispatch only — claims don't refresh TASKS.md until the next cron tick. Add near-real-time refresh: have the git-native backend fire a repository_dispatch (event-type tasks-claims-updated) after a successful claims push, and add that trigger to tasks-snapshot.yml. Surfaced finishing the dogfood projection 2026-06-03.
