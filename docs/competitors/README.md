# Competitors & prior art

How `tasks.md` relates to the tools people already use to track work for agents. The honest summary: plenty of tools store tasks, and several are agent-aware — but **none combine all three of the things `tasks.md` is built on:**

1. **A portable, cross-agent file** — one `TASKS.md` every agent reads, not a per-vendor or in-memory list.
2. **Collision-free claiming** — two agents can never both hold the same task (git-native backend), without a server.
3. **Deliberate thinness** — it owns only the task layer and delegates coordination, so it stays a spec, not a product.

Our default stance is **borrow, don't rebuild** (VISION § "Stay thin"): if an existing tool already coordinates work well, `tasks.md` adopts it as a *backend* rather than competing with it.

| Tool | Category | Relationship |
|---|---|---|
| [Backlog.md](backlog-md.md) | Markdown task manager + board | Closest peer — heavier; we stay a thin spec |
| [GitHub Issues / Projects](github-issues.md) | Hosted tracker | A `tasks.md` **backend**, not a rival |
| [Jira / Linear](jira-and-linear.md) | Enterprise trackers | Upstream backlog that *feeds* `tasks.md` |
| [Agent-native to-do tools](agent-native-todos.md) | In-agent task lists (Claude, Cursor, …) | Ephemeral / vendor-locked; we're the shared, persistent layer |
| [todo.txt & Taskwarrior](classic-cli-task-managers.md) | Classic CLI task managers | Human-first, single-user; not agent-claim-aware |
| [AGENTS.md](agents-md.md) | Agent conventions standard | **Complement, not competitor** — *how* vs *what* |

Each profile follows the same shape: **what it is → how it overlaps → how `tasks.md` differs → our stance.** Profiles describe architecture and design intent, not version-specific feature lists (those move fast); when in doubt, check the tool's own docs.
