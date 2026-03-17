# tasks-lint GitHub Action

Validate `TASKS.md` files against the [tasks.md spec](https://github.com/tasksmd/tasks.md).

## Usage

Add to your workflow:

```yaml
- uses: tasksmd/tasks.md/.github/actions/lint@main
```

### With options

```yaml
- uses: tasksmd/tasks.md/.github/actions/lint@main
  with:
    paths: "TASKS.md examples/"
    version: "0.1.0"
```

### Full workflow example

```yaml
name: Lint TASKS.md
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tasksmd/tasks.md/.github/actions/lint@main
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `paths` | Space-separated paths to lint | `TASKS.md` |
| `version` | Version of `tasks-lint` to use | `latest` |
