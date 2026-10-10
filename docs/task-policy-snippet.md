# Backend-aware task policy snippet

The snippet other repos copy, and where old copies still drift. It moved here
from `AGENTS.md` § Task Queue Policy.

## Canonical backend-aware policy snippet

Copy this into another repo's `AGENTS.md` / `CLAUDE.md` / Cursor rules so agents
learn the backend-aware default rather than a file-only one:

```markdown
## Task Management
- Read `TASKS.md` for available work; obey any `<!-- policy: ... -->` comments.
- Determine the backend from `.tasksmd.json` (default: file backend `tasks-md`).
  - **File backend:** claim by appending `(@you)` to the task line; complete by
    removing the whole task block (history lives in git log). Best-effort.
  - **Generated backend** (`git-native` / `github-issues`): `TASKS.md` is a
    generated snapshot — never hand-edit it. Use `tasks claim <id>` /
    `tasks complete <id>` / `tasks create "<title>"` (or the `tasks-mcp` tools);
    git-native claims are collision-free with a `claimId` fencing token.
- Pick highest-priority unblocked task (P0→P3); skip others' claims and blocked tasks.
```

## Downstream drift (outside this repo)

Operators have copied the older **file-only** snippet into other repos. Replace it
with the snippet above wherever it appears. The exact file-backend-only phrasings to
find-and-replace — "Claim tasks by appending `(@agent)`" / "edit `TASKS.md` directly" — appear at these locations: <!-- drift-allow: names the banned phrasings to replace -->

- `~/.config/agentbrew/` shared rules and `global_rules.md` "TASKS.md Format" /
  "Task Backend Configuration" sections.
- Any downstream repo `AGENTS.md` / `CLAUDE.md` whose Task-Management section
  predates the backend split.

These live outside this repo, so they are recorded here rather than edited; a
maintainer (or an `agentbrew sync`) propagates the backend-aware snippet.
