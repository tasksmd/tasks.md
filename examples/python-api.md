# Tasks
Spec v0.5

## P0

- [ ] Fix SQLAlchemy session leak causing connection pool exhaustion
  - **ID**: session-leak
  - **Details**: `/api/users` endpoint opens a session but doesn't close it on validation errors.
    Use `try/finally` or the `@contextmanager` pattern in `get_db()`.
  - **Files**: `src/db/session.py`, `src/api/users.py`
  - **Acceptance**: `pytest -k test_connection_pool` passes, no leaked sessions under load

## P1

- [ ] Add JWT refresh token rotation
  - **Tags**: auth
  - **Details**: Current refresh tokens are static. Implement one-time-use rotation:
    issue new refresh token on each use, revoke the old one.
    Store token families in Redis for replay detection.
  - **Files**: `src/auth/tokens.py`, `src/auth/routes.py`
  - **Blocked by**: session-leak

- [ ] Add Pydantic v2 model validation to all endpoints
  - **Tags**: backend
  - **Details**: Replace manual `dict.get()` validation with Pydantic models.
    Use `model_validator` for cross-field checks. Add `examples` to schema for OpenAPI.
  - **Files**: `src/models/`, `src/api/`
  - **Acceptance**: `mypy --strict src/` passes, `ruff check src/` clean

## P2

- [ ] Add structured logging with structlog
  - **Details**: Replace `print()` and `logging.info()` with structlog processors.
    Include request_id, user_id, and duration in all log entries.
- [ ] Set up Alembic migration for new `token_families` table
- [ ] Add `ruff` pre-commit hook and fix all existing violations
