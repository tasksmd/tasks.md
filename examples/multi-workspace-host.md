# Tasks

<!-- Demonstrates: multiple workspaces on one host — a cross-WORKSPACE
     `**Blocked by**: <workspace>::<repo>#<task-id>` reference. This is the
     TASKS.md of the `web` repo in the `tooling` workspace; it depends on a task
     in the `api` repo of a DIFFERENT workspace, `work`. With
     ~/.config/tasks-md/workspaces.json declaring both, `tasks next` (no flag)
     aggregates across them and resolves the reference. See spec.md
     § "Multiple workspaces on one host". -->

## P1

- [ ] Surface on-call status in the tooling dashboard
  - **ID**: dashboard-oncall-widget
  - **Tags**: frontend, cross-workspace
  - **Blocked by**: work::api#status-endpoint
  - **Details**: Embed the on-call status once the work API ships the endpoint. The `work::api#status-endpoint` reference points at the `api` repo in the `work` workspace.

## P2

- [ ] Document the multi-workspace setup in the team wiki
  - **ID**: doc-multi-workspace
  - **Tags**: docs
  - **Details**: Capture the `~/.config/tasks-md/workspaces.json` layout for new hires.
