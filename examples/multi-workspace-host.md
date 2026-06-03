# Tasks

<!-- Demonstrates: multiple workspaces on one host — a cross-WORKSPACE
     `**Blocked by**: <workspace>::<repo>#<task-id>` reference. This is the
     TASKS.md of the `web` repo in the `tooling` workspace; it depends on a task
     in the `api` repo of a DIFFERENT workspace, `oncall-hub`. With
     ~/.config/tasks-md/workspaces.yaml declaring both, `tasks next` (no flag)
     aggregates across them and resolves the reference. See spec.md
     § "Multiple workspaces on one host". -->

## P1

- [ ] Surface on-call status in the tooling dashboard
  - **ID**: dashboard-oncall-widget
  - **Tags**: frontend, cross-workspace
  - **Blocked by**: oncall-hub::api#status-endpoint
  - **Details**: Embed the on-call status once the oncall-hub API ships the endpoint. The `oncall-hub::api#status-endpoint` reference points at the `api` repo in the `oncall-hub` workspace.

## P2

- [ ] Document the multi-workspace setup in the team wiki
  - **ID**: doc-multi-workspace
  - **Tags**: docs
  - **Details**: Capture the `~/.config/tasks-md/workspaces.yaml` layout for new hires.
