# Tasks

<!-- Multi-agent setup: background agents work in parallel, each claiming tasks with their identity.
     Example identities in use:
       @cursor-bg     — Cursor background agent
       @claude-code   — Claude Code
       @devin         — Devin
       @codex         — OpenAI Codex CLI
     Each agent runs /next-task, claims the next unblocked unclaimed task, and loops. -->

<!-- policy: Commit and push claims immediately — other agents need to see them.
     policy: Never work on files another agent's task lists in its **Files** metadata. -->

## P0

- [ ] Resolve race condition in job queue consumer (@cursor-bg)
  - **ID**: job-race
  - **Tags**: backend, database
  - **Details**: Two workers occasionally process the same job. Add row-level locking with `SELECT ... FOR UPDATE SKIP LOCKED`.
  - **Files**: `src/jobs/consumer.ts`, `src/db/queries.ts`
  - **Acceptance**: No duplicate job processing in 10k-job stress test

## P1

- [ ] Add health check endpoint for load balancer
  - **Tags**: backend, infra
  - **Details**: `GET /healthz` returns 200 with `{"status": "ok", "db": true, "redis": true}`. Check actual connectivity, not just return 200.
  - **Files**: `src/routes/health.ts`
  - **Blocked by**: job-race

- [ ] Implement graceful shutdown with in-flight request draining
  - **Details**: On SIGTERM, stop accepting new connections, wait up to 30s for in-flight requests, then exit.
  - **Files**: `src/server.ts`

- [ ] Add structured JSON logging
  - **Details**: Replace `console.log` with pino. Include request ID, timestamp, level.
  - **Files**: `src/logger.ts`, `src/middleware/requestId.ts`

## P2

- [ ] Add Prometheus metrics endpoint
  - **Tags**: infra
- [ ] Write runbook for common operational issues
  - **Tags**: docs
- [ ] Add database migration CI check
  - **Tags**: infra, database
