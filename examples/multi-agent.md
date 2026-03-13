# Tasks
spec v0.5

## P0

- [ ] Resolve race condition in job queue consumer (@cursor-bg)
  - **ID**: job-race
  - **Details**: Two workers occasionally process the same job. Add row-level locking with `SELECT ... FOR UPDATE SKIP LOCKED`.
  - **Files**: `src/jobs/consumer.ts`, `src/db/queries.ts`
  - **Acceptance**: No duplicate job processing in 10k-job stress test

## P1

- [ ] Add health check endpoint for load balancer
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
- [ ] Write runbook for common operational issues
- [ ] Add database migration CI check
