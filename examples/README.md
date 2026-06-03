# Examples

Eight valid `TASKS.md` fixtures used as documentation. Each lints clean (`npx -y @tasks-md/lint examples/`) and demonstrates a different slice of the [spec](../spec.md). The `## P0` line in any example is the proof that the file is a working queue, not pseudo-code — copy any one of these into the root of your repo and `tasks pick` will work against it on the first run.

Each file opens with a `<!-- Demonstrates: ... -->` comment that names the format feature it showcases. Use this index to pick the closest match for your project before adapting.

> These are **file-backend** examples: `TASKS.md` is the source of truth, hand-edited, and the `(@agent)` claim in [`multi-agent.md`](multi-agent.md) is best-effort. For a fleet that needs collision-free claiming, the same files become a generated snapshot of the git-native backend — see [`spec.md` § Fleet coordination](../spec.md#fleet-coordination).

| Example | What it demonstrates | Spec section |
|---------|----------------------|--------------|
| [`cli-tool.md`](cli-tool.md) | Minimal task queue for a CLI tool — two file-level policies, P0→P2 priority spread, standard metadata (`**ID**`, `**Details**`, `**Files**`, `**Acceptance**`) with no blockers. | [Format](../spec.md#format), [Policies](../spec.md#policies) |
| [`complex-tasks.md`](complex-tasks.md) | Every spec feature at once — rich metadata (`**Plan**`, `**Blocked**`, `**Research**`, `**Last-enriched**`), sub-tasks, a `**Blocked by**` chain, file-level + section-level policies, a standing-loop audit task, and a multi-agent claim. The "kitchen sink" example. | [Metadata](../spec.md#metadata), [Standing audit loops](../spec.md#standing-audit-loops), [Sub-tasks](../spec.md#sub-tasks), [Blocked for a reason](../spec.md#blocked-for-a-reason) |
| [`mobile-app.md`](mobile-app.md) | Mobile (iOS + Android) task queue with `**Tags**`-routed feature work and a `**Blocked by**` chain that gates feature tasks on a P0 build fix. | [Metadata](../spec.md#metadata), [Blockers](../spec.md#blockers) |
| [`monorepo.md`](monorepo.md) | Monorepo workspace task queue with sub-tasks under a P1 parent, a `**Blocked by**` chain across packages, and a trailing freeform comment that explains how cross-file blockers resolve when an ID lives in a sibling `TASKS.md`. | [Multiple Files](../spec.md#multiple-files), [Sub-tasks](../spec.md#sub-tasks) |
| [`multi-agent.md`](multi-agent.md) | Multi-agent setup — the `(@agent-name)` claim format, agent-identity conventions for parallel sessions, and the policy of pushing claims immediately so other agents see them. | [Claiming](../spec.md#claiming), [Agent Identity](../spec.md#agent-identity) |
| [`python-api.md`](python-api.md) | Python REST API task queue with file-level policies (pytest + mypy + reversible migrations) and `**Tags**`-routed P1 work that funnels through a P0 session-leak fix via `**Blocked by**`. | [Format](../spec.md#format), [Policies](../spec.md#policies) |
| [`rust-cli.md`](rust-cli.md) | Rust CLI task queue with file-level policies (clippy + cargo test, no panics) and a `**Blocked by**` chain that gates feature work and integration tests on a P0 panic fix. | [Format](../spec.md#format), [Blockers](../spec.md#blockers) |
| [`web-app.md`](web-app.md) | Web app (Express/Node) task queue with file-level policies (CORS + secrets) and a `**Blocked by**` chain on rate-limiting work that depends on a P0 CORS fix. | [Format](../spec.md#format), [Blockers](../spec.md#blockers) |

## Validate locally

```bash
npx -y @tasks-md/lint examples/             # lint every file in this directory
npx -y @tasks-md/lint examples/web-app.md   # lint a single example
```

CI runs `node packages/lint/dist/cli.js examples/*.md` on every push to `main` and every pull request — see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). If any example regresses, the `lint` job fails before the `test` and `commands-drift` jobs run.

## See also

- [Specification](../spec.md) — the full TASKS.md format
- [Root README](../README.md) — quick start
- [User stories](../docs/user-stories/) — runnable walkthroughs that link back into these examples
