# todo.txt & Taskwarrior

Two well-loved, human-first CLI task managers — useful prior art for "tasks as plain, scriptable data."

**todo.txt.** A one-line-per-task plain-text format (priority `(A)`–`(Z)`, `+projects`, `@contexts`, `key:value` tags) plus a shell CLI. Dead simple, editable anywhere, git-friendly. But it has no assignee or claim concept, dependencies are a non-standard add-on, and conflicts are resolved *after* they happen — it assumes one user.

**Taskwarrior.** A powerful CLI manager storing tasks in a local database, with native priorities, dependencies (`depends:`), urgency scoring, and rich filtering. Built for an individual's workflow; multi-agent claiming exists only via third-party MCP/extensions, and its store is a database, not human-readable markdown in your repo.

**How they overlap with `tasks.md`.** All three are text/CLI-first and keep tasks close to the developer rather than in a heavy tracker. Both have a priority model and (Taskwarrior) a dependency model.

**How `tasks.md` differs.**
- **Single-user vs. multi-agent.** Neither has collision-free claiming; both assume one operator. `tasks.md` is built for many agents on one queue.
- **Format + location.** todo.txt is line-based; Taskwarrior is a binary DB. `tasks.md` is structured markdown sections in a repo file an agent can grep and diff.

**Our stance.** **Inspiration, not overlap.** They prove the value of plain, scriptable, local tasks — exactly `tasks.md`'s ethos. **Borrow:** todo.txt's "editable in any editor, no tool required" simplicity is a north star; Taskwarrior's urgency scoring is a reference for smarter `next-task` ranking if the flat priority order ever proves too coarse.
