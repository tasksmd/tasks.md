# Tasks

<!-- Demonstrates: workspace mode — cross-repo `**Blocked by**` within one workspace.
     This is the TASKS.md of the `web` repo inside a `tooling` workspace
     (~/apps/tooling/web/TASKS.md). A sibling repo `api` lives at
     ~/apps/tooling/api/. `tasks next --workspace ~/apps/tooling` aggregates both
     and resolves the cross-repo blocker below. See spec.md § Workspaces. -->

## P0

- [ ] Wire the dashboard to the rate-limit headers
  - **ID**: dashboard-ratelimit
  - **Tags**: frontend
  - **Blocked by**: api#rate-limit-headers
  - **Details**: Render the `X-RateLimit-*` values once the API emits them. Blocked on the sibling `api` repo's task in the same workspace.

## P1

- [ ] Add an empty-state to the task list
  - **ID**: tasklist-empty-state
  - **Tags**: frontend
  - **Details**: Show a friendly prompt when the queue is empty.
