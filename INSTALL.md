# Install tasks.md with your AI agent

This file is a playbook for an AI coding agent (Claude Code, Cursor, Codex,
Gemini CLI). A person starts it with the prompt at the top of
[README.md](README.md). It works for a new repo and for an update, and it is
safe to rerun.

1. **Ask: use or contribute?** Use means adding a task queue to the person's
   repo. Contribute means working on tasks.md itself: clone
   `https://github.com/tasksmd/tasks.md`, run `bash scripts/setup.sh`, and
   read [CONTRIBUTING.md](CONTRIBUTING.md).
2. **Set up the queue.** Follow [commands/setup.md](commands/setup.md) step by
   step. In short: `npx -y @tasks-md/cli init --install`, then
   `npx -y @tasks-md/cli install --agent <your-name>`.
3. **Run the doctor and fix each failing line.**
   `npx -y @tasks-md/lint TASKS.md` must exit 0. `npx -y @tasks-md/cli doctor`
   must print no `✗` line; each `⚠` line names its fix command.
4. **First run.** Show the person `/next-task` on one task from the queue.
5. **Telemetry.** Tell the person in one line: anonymous usage counts go to
   PostHog EU only when a project key is set; `tasks telemetry off` or
   `DO_NOT_TRACK=1` turns them off ([details](docs/observability.md#field-telemetry)).
6. **Report.** Say what you created and paste the doctor result. Offer to file
   an issue or PR for anything that could work better
   ([CONTRIBUTING.md](CONTRIBUTING.md)).
