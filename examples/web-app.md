# Tasks

**Spec**: v0.5

## P0

- [ ] Fix CORS headers blocking API requests from production domain
  - **ID**: cors-fix
  - **Details**: `Access-Control-Allow-Origin` only includes `localhost`. Add production domain.
  - **Files**: `src/middleware/cors.ts`
  - **Acceptance**: API accessible from `app.example.com`, no browser CORS errors

## P1

- [ ] Add rate limiting to public API endpoints
  - **Details**: Use `express-rate-limit`, 100 req/min per IP for `/api/public/*`
  - **Files**: `src/middleware/rateLimit.ts`, `src/routes/public.ts`
  - **Blocked by**: cors-fix

- [ ] Migrate database queries to prepared statements
  - **Details**: Replace string interpolation with parameterized queries in all `src/db/*.ts` files
  - **Files**: `src/db/users.ts`, `src/db/posts.ts`, `src/db/comments.ts`
  - **Acceptance**: All queries use `$1, $2` params, SQL injection test passes

## P2

- [ ] Add OpenAPI spec generation from route definitions
- [ ] Update README with new API endpoints
- [ ] Add request/response logging middleware
