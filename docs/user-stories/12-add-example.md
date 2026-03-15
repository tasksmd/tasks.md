# User Story: Add an Example

> As a contributor, I want to add a TASKS.md example for my stack so other developers can see what the format looks like in practice.

## Existing Examples

| Example | Stack | Complexity |
|---------|-------|-----------|
| [web-app.md](../../examples/web-app.md) | Express + React + PostgreSQL | Simple |
| [cli-tool.md](../../examples/cli-tool.md) | Node.js CLI | Simple |
| [monorepo.md](../../examples/monorepo.md) | Multi-package monorepo | Multi-file |
| [multi-agent.md](../../examples/multi-agent.md) | Multiple specialized agents | Claims + tags |
| [complex-tasks.md](../../examples/complex-tasks.md) | Mixed | All features |
| [python-api.md](../../examples/python-api.md) | FastAPI + SQLAlchemy + pytest | Medium |
| [rust-cli.md](../../examples/rust-cli.md) | Cargo + clippy + assert_cmd | Medium |
| [mobile-app.md](../../examples/mobile-app.md) | React Native + biometrics | Medium |

## Steps

1. **Create the file** in `examples/`:
   ```bash
   touch examples/my-stack.md
   ```

2. **Write valid TASKS.md content**. The file must follow the spec:
   ```markdown
   # Tasks

   ## P0

   - [ ] Fix critical bug in payment flow
     - **ID**: payment-fix
     - **Details**: Stack-specific context here

   ## P1

   - [ ] Add feature X
     - **Blocked by**: payment-fix
   ```

3. **Validate** against the spec:
   ```bash
   bash scripts/validate-examples.sh examples/my-stack.md
   ```
   Or use the full linter:
   ```bash
   node lint/index.js examples/my-stack.md
   ```

4. **Add to README** — update the examples list in `README.md`:
   ```markdown
   - [My stack](examples/my-stack.md) — Brief description
   ```

5. **Submit a PR** with a conventional commit:
   ```bash
   git add examples/my-stack.md README.md
   git commit -m "docs: add my-stack example"
   ```

## What Makes a Good Example

- **Realistic tasks** — actual work items for that stack, not contrived examples
- **Stack-specific metadata** — file paths, tools, and acceptance criteria that match the ecosystem (e.g., `cargo clippy` for Rust, `pytest` for Python)
- **Mix of complexities** — some bare one-liners, some with rich metadata
- **Show blockers** — at least one dependency chain to demonstrate the feature
- **Show tags** — if the stack has natural specializations (frontend/backend, lib/app)

## Validation Rules

The example validator (`scripts/validate-examples.sh`) checks:

- First line is `# Tasks`
- Priority headings are P0–P3 in order
- Tasks use `- [ ]` checkbox format
- No completed (`- [x]`) top-level tasks

The full linter (`lint/index.js`) additionally checks IDs, blockers, and metadata format.

## Files Involved

| File | Purpose |
|------|---------|
| `examples/*.md` | Example TASKS.md files |
| `scripts/validate-examples.sh` | Lightweight format validator |
| `lint/index.js` | Full spec linter |
| `README.md` | Examples list to update |
