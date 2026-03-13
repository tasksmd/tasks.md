# Tasks

## P0 — Critical

- [x] Fix database connection pool exhaustion under load (@claude-code)
  - **Details**: Pool max is 10 but p95 concurrency is 25. Increase to 50 with proper idle timeout.
  - **Files**: `src/db/pool.ts`

- [ ] Resolve race condition in job queue consumer (@cursor-bg — in progress)
  - **Details**: Two workers occasionally process the same job. Add row-level locking with `SELECT ... FOR UPDATE SKIP LOCKED`.
  - **Files**: `src/jobs/consumer.ts`, `src/db/queries.ts`
  - **Acceptance**: No duplicate job processing in 10k-job stress test

## P1 — Important

- [ ] Add health check endpoint for load balancer
  - **Details**: `GET /healthz` returns 200 with `{"status": "ok", "db": true, "redis": true}`. Check actual connectivity, not just return 200.
  - **Files**: `src/routes/health.ts` (new)
  - **Blocked by**: "Resolve race condition in job queue consumer"

- [ ] Implement graceful shutdown with in-flight request draining
  - **Details**: On SIGTERM, stop accepting new connections, wait up to 30s for in-flight requests, then exit.
  - **Files**: `src/server.ts`

- [ ] Add structured JSON logging
  - **Details**: Replace `console.log` with pino. Include request ID, timestamp, level.
  - **Files**: `src/logger.ts` (new), `src/middleware/requestId.ts` (new)

## P2 — Nice to Have

- [ ] Add Prometheus metrics endpoint
- [ ] Write runbook for common operational issues
- [ ] Add database migration CI check
