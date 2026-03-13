# Tasks
Spec v0.5

## P0

- [ ] Fix payment webhook losing events under load (@backend-agent)
  - **ID**: webhook-fix
  - **Tags**: backend, payments
  - **Details**: Under high load (>100 events/sec), the webhook endpoint returns 200
    before persisting the event, causing Stripe to consider it delivered while we drop it.
    Fix approach:
    - Accept the webhook and write to a durable queue (Redis stream or DB table) first
    - Return 200 only after the queue write succeeds
    - Process events from the queue in a separate worker
    - Add idempotency key check to prevent duplicate processing
    See incident report: https://internal.example.com/incidents/2025-03-10
  - **Files**: `src/webhooks/stripe.ts`, `src/jobs/webhook-processor.ts`,
    `src/db/migrations/add-webhook-events-table.sql`
  - **Acceptance**: No dropped events under 500 events/sec sustained load.
    Duplicate events are detected and skipped.
    Webhook endpoint p99 latency < 50ms.
    Existing integration tests pass.

## P1

- [ ] Implement user role-based access control
  - **ID**: rbac
  - **Tags**: backend, auth
  - **Details**: Currently all authenticated users have the same permissions.
    Add a role system with three levels:
    - **viewer**: read-only access to all resources
    - **editor**: create and update resources they own
    - **admin**: full access, user management, role assignment
    Roles are stored in the `users` table as a `role` column (default: viewer).
    Enforce at the middleware level so individual routes don't need to check.
  - **Files**: `src/middleware/auth.ts`, `src/db/migrations/add-user-roles.sql`,
    `src/routes/admin.ts`, `src/types/user.ts`
  - **Acceptance**: Viewers cannot create/update/delete resources.
    Editors can manage their own resources only.
    Admins can manage all resources and assign roles.
    Unauthorized actions return 403 with a clear error message.
    Role checks covered by integration tests.
  - **Blocked by**: webhook-fix
  - [x] Design role schema and migration
  - [x] Add role column to users table
  - [ ] Implement middleware role check
  - [ ] Add admin routes for role management
  - [ ] Write integration tests for all three roles

- [ ] Migrate from Express to Fastify
  - **Tags**: backend, infra
  - **Details**: Express is unmaintained and lacks native async/await support.
    Fastify gives us schema validation, better performance, and TypeScript support.
    Migration plan:
    - Set up Fastify app alongside Express (dual-stack for one release)
    - Migrate routes one by one, starting with health check
    - Move middleware to Fastify hooks/plugins
    - Remove Express once all routes are migrated
    - Update deployment config for Fastify's listen API
    Keep both frameworks running during migration so we can roll back per-route.
  - **Files**: `src/server.ts`, `src/routes/`, `src/middleware/`, `package.json`
  - **Acceptance**: All existing routes work on Fastify.
    Response format unchanged (no breaking API changes).
    Startup time improved or unchanged.
    Express fully removed from dependencies.

## P2

- [ ] Add OpenTelemetry distributed tracing
  - **Tags**: backend, infra
  - **Details**: Add trace context propagation across HTTP and queue boundaries.
    Use `@opentelemetry/sdk-node` with auto-instrumentation for Express/Fastify,
    pg, and Redis. Export to Jaeger in dev, OTLP in production.
  - **Files**: `src/telemetry.ts`, `src/server.ts`

- [ ] Write architecture decision record for queue choice
  - **Tags**: docs
