# Research: git-native deterministic fleet claiming

> Prior-art + mechanics research backing the `deterministic-fleet-claiming` task and
> [`docs/plans/deterministic-fleet-claiming.md`](../plans/deterministic-fleet-claiming.md).
> Lens: **GET, don't IMPLEMENT** (VISION G6). Date: 2026-06-02.

## TL;DR (headline findings)

1. **One correctness correction (must fix the plan).** "Winner = first `claimed` event in
   git commit order" is **NOT deterministic across clones** if the claims ref is ever
   allowed to fork/merge — `git log --topo-order`/`--date-order` does not guarantee a
   stable tiebreak for concurrent commits (the git docs themselves show two valid
   orderings). Fix: decide the winner by an **explicit total-order key embedded in each
   event** — a Lamport clock with `(lamport, actor_id, content_hash)` tiebreak — *and/or*
   keep the ledger ref **strictly linear** (rebase-only CAS push, reject merges). The
   Lamport approach is the proven one (git-bug, since 2018).
2. **Adopt the model, not the code: git-bug `entity/dag`.** It is almost exactly our
   ledger — an append-only operation log on dedicated git refs with Lamport-clock CRDT
   merge — but it's Go + GPL-3.0, so we adopt the **design**, not link the code.
3. **Adopt a hook manager: lefthook.** Don't hand-roll a hook installer. Single Go
   binary, language-agnostic, committed config, idempotent install, pre-push support.
4. **Portable claims-ref default = a plain `tasks-claims` branch** (not `refs/notes/*`,
   not a custom `refs/tasks/*`). It's the only namespace that's universally pushable AND
   CI-visible AND branch-protectable across GitHub/GitLab/Gitea/Bitbucket.
5. **GitHub's ~6 pushes/min/repo limit makes per-host batching nearly mandatory**, not a
   late optimization — and ref-sharding *within one repo* does NOT dodge it (the limit is
   per-repo). A sidecar claims repo is the real escape hatch at scale.
6. **On github.com the server-side guarantee = Rulesets + a required status check** (no
   `pre-receive` exists there); `pre-receive` is GHE/GitLab/Gitea only. Client hooks are
   ergonomics, never the guarantee.
7. **The field is crowded.** tasks.md's defensible niche is the *portable spec* + the
   *cross-machine-over-git-no-server* claim; most competitors are single-host or
   server-backed.

## 1. Event-log-on-git: prior art + the determinism correction

The append-only-log-on-git-refs model is **proven**, not novel:

- **git-bug** (MichaelMure/git-bug, ~9.8K★, Go, GPL-3.0) — distributed bug tracker storing
  entities as append-only **operation logs** under `refs/bugs/*`, merged across clones via
  a DAG with **Lamport logical clocks** (not wall-clock) for deterministic ordering. Its
  reusable `entity/dag` package (PR #532, v0.8.0) is a generalized "append-only entity on
  git with deterministic CRDT merge" engine — the closest existing fit for our ledger.
  - Data model: <https://github.com/MichaelMure/git-bug/blob/master/doc/design/data-model.md>
  - `entity/dag`: <https://github.com/MichaelMure/git-bug/tree/master/entity/dag>
- **git-appraise** (google/git-appraise) — code review in `refs/notes/devtools/*`,
  append-only, merged by git's `cat_sort_uniq` notes strategy. Simpler (no Lamport clock,
  no DAG); a useful pattern but weaker for contended writes.
- **grite** (Rust, `libgrite-git`) — event-sourced issues as a WAL in `refs/grite/wal` +
  `refs/grite/snapshots/*`, CRDT merge, TTL leases. Strong design reference (Rust → adopt
  design only). <https://crates.io/crates/libgrite-git>
- **GATOS** (flyingrobots/gatos) — git-as-event-store with a deterministic fold; over-built
  for our needs but confirms the fold model.
- **Dolt** — "git for data"; cell-wise merge, not event-sourced → not a fit.

**The correction in detail.** Git ordering is non-deterministic on ties:
`git log` docs explicitly show `--topo-order` can yield "8 6 5 3 7 4 2 1 (or 8 7 4 2 6 5 3
1)"; `--date-order` is undefined when committer dates tie (clock skew, batch writes).
So "first claimed in commit order" can pick different winners on different clones when two
claims are *truly concurrent in the DAG*. Two robust resolutions:
- **(b) Explicit total order (recommended):** each `claimed` event carries a Lamport clock;
  winner = min `(lamport, actor_id, content_hash)`. Deterministic regardless of git
  ordering — git-bug's battle-tested approach. (Snapshot/compaction: Kafka log-compaction
  and Akka/EventStoreDB snapshot patterns apply; keep full history for audit, snapshot for
  fast reads.)
- **(a) Strict linearity:** keep the ledger ref a single linear chain (rebase-only
  CAS-push, reject merge commits). Then order is total and "first in chain" is
  unambiguous. Cheaper, but one stray non-rebase merge breaks it — so pair with (b).

Refs: git-log <https://git-scm.com/docs/git-log>; commit-graph corrected-dates
<https://git-scm.com/docs/commit-graph>; CRDT survey <https://dl.acm.org/doi/10.1145/3695249>.

## 2. Git mechanics (transport)

- **Push = atomic CAS.** Non-fast-forward rejection is atomic server-side
  (`receive-pack` `execute_commands_atomic`); a dropped connection leaves the ref updated
  or not, never half. `git push --atomic` for multi-ref (HTTP carries the capability since
  Git 2.23; SSH/local always). <https://git-scm.com/docs/git-push>,
  <https://git-scm.com/docs/githooks> (reference-transaction phases).
- **Ref portability → use a plain `tasks-claims` branch.** Custom `refs/tasks/*` is
  pushable everywhere but is **not** visible to CI triggers or branch-protection;
  `refs/notes/*` is unsupported on GitLab and UI-dropped on GitHub. A plain branch is the
  only universally pushable + CI-visible + protectable option. <https://git-scm.com/docs/git-push>
- **Throughput ceiling is concrete: GitHub recommends ≤ ~6 pushes/min/repo.** That's ~1
  claim / 10 s — so at fleet scale you **must** batch per host (one pusher coalescing its
  agents' events). Critically, the limit is **per-repo**, so sharding the ledger across
  multiple refs in the *same* repo does NOT raise it — only per-host batching or a
  **sidecar claims repo** does. (Self-hosted Gitaly/reftable scales much higher.)
  <https://docs.github.com/repositories> (repo limits); reftable
  <https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/gitaly_reftable_rollout/>.

## 3. Enforcement (determinism, not skills)

- **`core.hooksPath` is per-clone, not committed** (and Git 2.45.1 added clone-time
  protection), so committed hooks need a one-time install step. → **Adopt lefthook**
  (evilmartians/lefthook): single Go binary, committed `lefthook.yml`, idempotent
  `lefthook install` (MD5-checksummed), parallel, pre-push/post-merge/prepare-commit-msg.
  Don't hand-roll an installer. (Husky = good if Node is already present; pre-commit =
  heavier, Python.) <https://github.com/evilmartians/lefthook>
- **Client hooks are ergonomics, not a guarantee** — bypassable via `--no-verify`, unset
  `core.hooksPath`, fresh clone w/o install, `GIT_HOOKS=0`. <https://git-scm.com/docs/githooks>
- **The real guarantee is server-side, and it differs by host:**
  - **github.com:** NO `pre-receive`. Use **Repository Rulesets** (newer than legacy branch
    protection; multiple rulesets aggregate, pattern-match `tasks-claims*`, settable via
    `gh api`): block force-push/delete on the ledger ref + `required_linear_history`; and a
    **required status check** workflow that reads the ledger and asserts a live `claimed`
    by `github.actor`. Use `pull_request` (NOT `pull_request_target`) for the check.
    Rulesets: <https://docs.github.com/rest/repos/rules>; Actions security
    <https://securitylab.github.com/resources/github-actions-new-patterns-and-mitigations/>.
  - **GHE / GitLab / Gitea:** a `pre-receive` / server hook is the strongest layer (reject a
    push to `main` lacking a claim; reject non-append to the ledger). Not on github.com.
    <https://docs.gitlab.com/administration/server_hooks/>
- **Agent-native hooks** (Claude Code / Devin / Cursor `PreToolUse`) can enforce "claim
  before work" *inside the agent loop* — a complementary UX layer, not cross-tool.
  <https://code.claude.com/docs/en/hooks>, <https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks>

## 4. One-prompt setup — patterns to model `tasks fleet init` on

- **lefthook / husky / pre-commit install** — idempotent hook install (re-run = no-op via
  checksum / overwrite). Model the hook step on `lefthook install`.
- **Probot "Settings" app / Terraform `github_repository_ruleset`** — settings-as-code,
  idempotent ruleset sync. Model the protection step on these.
- **`gh api` rulesets** — concrete idempotent calls exist (POST `/repos/{o}/{r}/rulesets`);
  best-effort, and print the manual command when the actor lacks admin.
- **Enterprise reality** (PRs-for-everything, protected `main`): use a **bot identity** to
  push the ledger ref, or a **sidecar claims repo**, or unprotected `tasks-claims*` refs.

## 5. Competitive landscape (strategic)

Two crowded, fast-moving clusters:

- **Markdown-in-git task tools** (direct format overlap): **Backlog.md** (MrLesk, ~5K★,
  MCP + CLI + board + init wizard), veggiemonk/backlog (Go), backlogmd, TaskWing.
- **Multi-agent orchestrators with claims + worktrees:** **backlog.so** (claims that lock
  file scopes, **TTL recovery**, `Backlog-Run/Task/Subtask` commit trailers, local-first),
  **lodestar** (claims + leases + DAG + two-plane, runtime in gitignored SQLite),
  railyard, taskplane, agent-kanban (Ed25519 agent identities), gitswarm (consensus).

**Positioning takeaway:** almost all are **single-host** (SQLite/local daemon/worktrees) or
**server-backed** (Postgres/Redis/MySQL). The **cross-machine-over-git, no-server**
coordination (VISION G7) is still largely unoccupied. So tasks.md's defensible bet is the
**portable spec + the thin git-native claim primitive** that these tools can converge on —
and we should **adopt** proven engines (git-bug's model, lefthook, GitHub Rulesets) rather
than build an orchestrator (G6). Several competitors already validate sub-pieces we
proposed (backlog.so's TTL claims + commit trailers; lodestar's two-plane + leases).

## 6. Corrections + actions for the plan

- **Correction (v1 correctness):** replace "first claimed in commit order wins" with an
  explicit **Lamport-clock total order** (`(lamport, actor_id, content_hash)`), and keep
  the ledger ref rebase-only/linear as defense-in-depth. → amends Step 3/4 + acceptance #5.
- **Adopt lefthook** for hook install (Step 6/7) instead of a bespoke installer.
- **Default the claims ref to a plain `tasks-claims` branch**; document `refs/tasks/*` and
  sidecar-repo as alternatives (Step 1).
- **Promote per-host batching from "optimization" to "needed on github.com"** (~6
  pushes/min/repo); note ref-sharding doesn't dodge the per-repo limit — a sidecar repo
  does. → sharpens the throughput risk + `fleet-claim-coordinator-daemon`.
- **Use Rulesets (not legacy branch protection)** for the server-side config (Step 6).
- **Adopt-X follow-ups to file:** `fleet-claim-adopt-gitbug-model` (port the Lamport-clock
  op-log/fold design), `fleet-claim-adopt-lefthook` (hook install), and fold the Rulesets
  recipe into `fleet-claim-server-enforcement`.

## 7. Operator review decisions (2026-06-02)

After reviewing this research the operator set the direction:

- **Pure spec, thinnest possible — but requirements provably met.** tasks.md owns the
  spec + a runnable **conformance suite** + a **thin reference adapter** + one-prompt
  wiring; it builds **no ledger engine and no orchestrator**. The conformance suite (not
  source ownership) is how the requirements are guaranteed for any backend.
- **Reuse git-bug — do NOT reimplement.** Language-agnostic (TS preferred by default). The
  exact reuse mechanism (binary shell-out vs. library vs. contributing a `claim`/`lease`
  entity upstream) is **undecided** → open spike `fleet-claim-gitbug-reuse-spike`.
- **Full-belt enforcement** (lefthook + Rulesets + required check + `pre-receive`).
- **Medium scale (~tens of machines):** per-host batching lives in the reference adapter; a
  sidecar claims repo is the escape hatch; a queue backend only past the trip-wire.

These supersede the build-it framing in earlier plan revisions; see the rewritten
[`docs/plans/deterministic-fleet-claiming.md`](../plans/deterministic-fleet-claiming.md).
