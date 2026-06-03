# Jira & Linear

**What they are.** Enterprise issue trackers. Jira is the long-standing Atlassian tracker (REST + webhooks, deep workflow customization, SSO/permissions). Linear is the newer, API-first tracker (GraphQL, fast UI, opinionated workflow). Both store issues in vendor cloud and are increasingly wired to AI agents via MCP servers.

**How they overlap with `tasks.md`.** Both model a prioritized backlog with assignees, dependencies, and rich metadata — the same concepts `tasks.md` carries as priority sections, `(@agent)` claims, and `blocked-by`.

**How `tasks.md` differs.**
- **Weight.** Jira/Linear are built for sprint planning and cross-team coordination, with auth, rate limits, and network round-trips. `tasks.md` is built for the small, in-session work an agent does, in a file that needs no setup.
- **Where it lives.** Their source of truth is a hosted service; `tasks.md`'s is a file in your repo, offline-capable and versioned with the code.
- **Claiming.** They coordinate through optimistic locking and comment threads, not an atomic git-level claim.

**Our stance.** **Upstream, not opponent.** A team can keep Jira/Linear as the human-facing backlog and let `tasks.md` be the agent-facing slice of it — promote a few ready issues into `TASKS.md` (or back them with the Issues backend), let agents drain that queue, and report results upstream. **Borrow:** Linear's API-first, typed-GraphQL design is the reference if `tasks.md` ever grows a hosted backend.
