# AGENTS.md — complement, not competitor

**What it is.** [AGENTS.md](https://agents.md/) is the widely-adopted standard for telling agents *how to work in a repo*: build commands, test runners, code style, conventions, and guardrails. It's a plain markdown file at the repo root (nestable per directory), read by most major agents, and — crucially — **read-only**: humans write it, agents follow it.

**Why it's listed here.** Because the most common question is "isn't `tasks.md` just AGENTS.md for tasks?" — and the answer clarifies what `tasks.md` *is*. They are the two halves of agent onboarding:

| Standard | Answers | Mutability |
|---|---|---|
| **AGENTS.md** | *How* do I work here? (conventions, build, test) | Read-only — humans author it |
| **TASKS.md** | *What* should I work on next? (queue, priority, claims) | Mutable — agents claim + complete |

An agent reads `AGENTS.md` to learn the rules of the repo, then reads `TASKS.md` to pick the next piece of work. AGENTS.md says *"run `npm test`, use strict TypeScript"*; TASKS.md says *"fix the auth crash (P0), then add rate limiting (P1)."*

**How `tasks.md` aligns with it.** Same philosophy: a plain, git-committed, cross-agent markdown file — no server, no lock-in. `tasks.md` deliberately positions itself as AGENTS.md's sibling and links to it everywhere.

**Our stance.** **Pure complement.** Every repo should have both. We never duplicate AGENTS.md's "how to work" scope, and the `tasks.md` setup flow happily coexists with (and points at) AGENTS.md.
