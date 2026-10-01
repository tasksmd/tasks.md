# GitHub Issues / Projects

**What it is.** GitHub's hosted issue tracker (plus Projects boards). Issues live on GitHub's servers; you read and write them through the REST/GraphQL API. Issues carry assignees, labels, milestones, and dependency links, and GitHub's own coding agent can be assigned to them.

**How it overlaps with `tasks.md`.** Both represent a queue of work with priority (labels) and ownership (assignee). Both are increasingly used to hand work to AI agents.

**How `tasks.md` differs.**
- **Hosted vs. in-repo.** Issues require a network connection, auth, and a GitHub account, and are rate-limited; `TASKS.md` is a local file that works offline and is versioned in your repo.
- **Claiming isn't git-native.** "Only one agent runs this" is enforced (if at all) by GitHub Actions concurrency groups at the *workflow* level, not by an atomic task-level claim. `tasks.md`'s git-native backend claims via compare-and-swap on a git ref.
- **Tracker vs. task layer.** Issues come bundled with discussions, PRs, and project boards; `tasks.md` is just the prioritized, claimable queue.

**Our stance.** **Not a rival — a backend.** `tasks.md` ships a `github-issues` backend so a team already living in Issues keeps the same `TASKS.md` surface and `/next-task` workflow while issues remain the store. Use it when the team is GitHub-centric; use the file or git-native backend when you want the queue in-repo and offline-capable.
