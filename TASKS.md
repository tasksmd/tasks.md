# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

- [ ] One-prompt setup: a developer tells their agent to "use tasks.md" and the agent does the entire setup
  - **ID**: one-prompt-setup
  - **Tags**: docs, user-story, onboarding, cli, commands, adoption, dx
  - **Details**: Add a new user story (lands as `docs/user-stories/10-one-prompt-setup.md`):

    > **I am a developer and I want to tell my agents to use tasks.md in my GitHub repo — in one step.**

    Today adoption is a manual or multi-command path: the README "Quick Start" tells the human to hand-create `TASKS.md` and paste an `AGENTS.md` snippet, and the "first 10 minutes" walkthrough runs ~9 commands (`tasks init`, `tasks install`, …). The vision is **one prompt in the README** that the developer pastes into whatever agent they use (Claude Code, Cursor, Devin, Codex, Gemini CLI, Windsurf); the agent then does the rest, end to end, with no further input.

    **Outcome-shaped** (what the developer experiences):

    1. The README has a single, prominent, copy-paste prompt block: *"Set up tasks.md in this repo."*
    2. The developer pastes it into their agent. The agent: confirms the git repo root → creates `TASKS.md` if missing → idempotently merges the `## Task Management` section into `AGENTS.md` → installs the `/next-task` (and `/lint-tasks`) command for **itself** → verifies the result → reports done. No human CLI knowledge required.
    3. Re-running is safe — it merges, never clobbering an existing `TASKS.md` or duplicating the `AGENTS.md` section.
    4. Works whether or not Node/`npx` is available (CLI path preferred; direct-file-write fallback otherwise).

    **What this requires — build on what exists (GET, don't reinvent):**

    Reuse: `tasks init` (creates `TASKS.md` + merges the `AGENTS.md` section, already idempotent — `packages/cli/src/commands/init.ts`); `tasks install` (installs `/next-task` per agent — `packages/cli/src/commands/install.ts`); `tasks generate-commands` (regenerates per-agent variants from a canonical source, CI-drift-gated — the pattern a setup command must follow, VISION G2).

    Gaps to close:
    - **(a) The prompt artifact.** Add a canonical copy-paste "set up tasks.md" prompt to the README. Recommended: make it the canonical `commands/setup.md` and regenerate per-agent `setup` command/skill variants via `tasks generate-commands`, so "the agent does the rest" is identical and deterministic across all six agents (consistent with G2 — generated, not free-handed).
    - **(b) Self-install fix (CLI bug).** `tasks install --agent <name>` silently installs nothing when the agent's own dir does not yet exist, because the detect-dir check still runs unless `--all` is also passed (`packages/cli/src/commands/install.ts`: `if (!options.all && !existsSync(detectPath)) continue;`). For a one-prompt bootstrap the calling agent (which knows its own identity) must be able to force-install its own command — make `--agent <name>` imply force (skip detection for the named agent), or add an explicit `--force`.
    - **(c) Node-optional fallback.** The prompt/command must instruct the agent: if `npx`/Node is present, use `tasks init` + `tasks install --agent <self>`; otherwise write `TASKS.md`, the `AGENTS.md` `## Task Management` section, and the agent's own command file directly from the spec + canonical command text.
    - **(d) Verifiable acceptance.** The agent finishes by running `npx -y @tasks-md/lint TASKS.md` (exit 0), confirming `AGENTS.md` has exactly one `## Task Management` section, and confirming its own command file exists at the right project-local path.
    - **(e) GitHub-repo extras (optional branches in the prompt).** Offer to add the reusable lint CI workflow (`.github/workflows/tasks-lint.yml`) and/or back the queue with the shipped GitHub Issues backend (`task_backend: github-issues`, VISION G5) for teams that live in their issue tracker.
  - **Files**: `README.md` (add the one-prompt block; trim/redirect the manual Quick Start), `docs/user-stories/10-one-prompt-setup.md` (new), `docs/user-stories/README.md` (add row 10 + table entry), `commands/setup.md` (new canonical source) + the six generated `commands/<agent>/…/setup.*` variants via `tasks generate-commands`, `packages/cli/src/commands/install.ts` (+ `install.test.ts`) for the `--agent` force-install fix, `packages/cli/src/commands/generate-commands.ts` (+ test) to emit the new `setup` command, `ROADMAP.md` (capability row).
  - **Acceptance**: (a) README contains a single copy-paste "set up tasks.md" prompt; (b) `docs/user-stories/10-one-prompt-setup.md` exists and is linked from `docs/user-stories/README.md`; (c) a `setup` command is generated for all six agents from `commands/setup.md` and the `commands-drift` CI gate stays clean; (d) `tasks install --agent <name>` force-installs that agent's command even when its dir doesn't exist yet, pinned by a new `install.test.ts` case; (e) the prompt documents the Node-optional fallback plus the idempotency and verification steps; (f) `npm run build && npm test && npm run lint` pass; (g) `npx -y @tasks-md/lint TASKS.md` exits 0.

- [ ] Make task selection collision-free across a team of machines, each running a parallel agent fleet, without breaking determinism
  - **ID**: deterministic-fleet-claiming
  - **Tags**: spec, claiming, concurrency, fleet, two-tier, distributed, backend, reuse, vision, primary-use-case, parser, mcp, cli
  - **Details**: At fleet scale (many agents across many machines reading one
    git-synced TASKS.md) the best-effort `(@agent-id)` claim cannot prevent two
    agents picking the same task: claims are only visible after a push (spec.md
    § Claiming "Limitations"), and `pickBestTask` is deterministic — so every agent
    on an identical file picks the *same* top task. Determinism turns "can collide"
    into "will collide". `tasks claim` is also a no-op today
    (packages/cli/src/backend/tasks-md.ts) — there is no machine-safe claim
    primitive in the file backend at all. Operator hard constraints: (1) selection
    MUST stay deterministic — no random/probabilistic picking; (2) it must hold at
    fleet (high-concurrency) scale; (3) MUST support a TWO-TIER topology — a TEAM of
    different machines working simultaneously (synced only by an eventually-consistent
    git remote, possibly multiple owners) where EACH machine also runs a PARALLEL
    FLEET of agents (shared local filesystem) — collision-free at BOTH tiers. Per
    VISION G7 this is now the project's PRIMARY use case; per G6 the approach is
    ADOPT-don't-build — delegate coordination to an existing backend (atomic queue /
    git-native queue / MCP broker) behind the G5 seam and layer tasks.md's
    tags/priority/blocked-by on top; build a bespoke coordinator ONLY if no backend is
    adaptable. DECISION (operator, 2026-06-02): the backend is GIT-NATIVE — agents are
    FILE-NATIVE (they read/write/grep markdown and run git as a matter of course; a
    server-backed queue is outside that fluency), so coordination lives in files + git,
    no server. Remaining design work: pin the git-native mechanism (see Research (f)),
    record it in spec.md § Claiming + a new user story, then split implementation into
    follow-ups. Stay scoped to the tasks.md repo.
  - **Research**: 2026-06-02 (a) option space under {deterministic, fleet}:
    • Atomic claim alone (git-CAS / shared MCP / issue-assignee): deterministic
      *outcome* (one winner) but thundering-herd O(N) on the hottest task at fleet
      scale — all N agents compute the same pick, N-1 lose, re-pick the next, repeat.
    • Deterministic partition, round-robin by rank: agent k-of-N takes ranks
      k, k+N… of the sorted queue. Zero-coord, herd-free, offline, priority-fair
      (top N tasks each worked once). Churn-sensitive (N changes reshuffle) + index
      shifts on insert. Needs (k, N).
    • Deterministic partition, rendezvous/HRW hashing: owner(task)=argmax_a
      hash(task_id, a). Even spread + MINIMAL reshuffle on join/leave (O(K/N) not
      O(K)) + stable under task insertion (keyed by id, not index). Priority-blind,
      so run the existing priority picker WITHIN each agent's owned set. Needs roster.
    • Orchestrator as sole deterministic assigner: repo already leans this way — the
      `**Touches**` field flags file-set overlap for parallel launches, and
      taskgrind/minsky/fleet-grind are orchestrators. Moves coordination out of the
      format (matches VISION "not a workflow engine").
    • Layered (current lean): HRW partition for the bulk + git-push CAS claim only
      for cross-partition *stealing* of the hot tail + TTL lease + fencing token.
      Deterministic & herd-free in the common case, guaranteed-correct on contention.
    CRUX: every partition reduces to "how do fleet agents deterministically agree on
    the roster / (k, N)?" — static (orchestrator passes --shard k/N) vs a committed
    heartbeat ledger (`.tasks/agents/<id>` with TTL, which ALSO fixes the fuzzy
    stale-claim heuristic in spec.md § Stale Claims). Sync lag bounds overlap to
    membership-churn windows; a git-CAS claim-verify catches those.

    2026-06-02 (b) prior-art survey (GitHub + distributed systems + Claude format).
    Four coordination families seen in the wild:
    1. Central orchestrator / lead-assigns (NO worker race): Claude Code **Agent
       Teams** (lead assigns or teammates self-claim a shared list; "task claiming
       uses file locking" — but the list is LOCAL `~/.claude/tasks/<team>/`, so
       single-host only), Anthropic's orchestrator-worker research system
       (decompose-by-aspect = orthogonal/non-overlapping work), claude-flow,
       parruda/swarm, OpenHands, CrewAI (hierarchical), AutoGen, LangGraph (BSP/Pregel
       deterministic DAG). https://code.claude.com/docs/en/agent-teams +
       https://www.anthropic.com/engineering/multi-agent-research-system
    2. Atomic broker (multi-machine, race-free, but needs a server): Postgres
       `SELECT … FOR UPDATE SKIP LOCKED`, Redis `SET NX PX` / `BLPOP`. Used by
       DreamAgent, swarms AOP, agent-orchestrator. The de-facto production answer.
       https://www.postgresql.org/docs/current/explicit-locking.html
    3. Git best-effort claim: ONLY tasks.md does this; explicitly best-effort.
       Adjacent git-native patterns: file-lock-then-push
       (agentpatterns.ai/multi-agent/file-based-agent-coordination), czarina+Hopper
       (persistent queue), terraform-backend-git (push-a-lock-branch CAS).
    4. Filesystem isolation via git worktrees: claude-squad, tmux-orchestrator,
       czarina, queen-protocol — solves FILE conflicts, NOT task conflicts (still
       need a claim layer). Maps to our `**Touches**`.
    Key facts that shape the fix:
    • Almost every multi-agent tool is SINGLE-HOST; Claude's own answer (Agent Teams)
      uses OS file-locking on a local list — unavailable across machines. tasks.md's
      multi-machine-over-git setting is genuinely harder; that is the niche.
    • `git push` IS an atomic compare-and-swap (non-fast-forward ref rejection) —
      this, not anything new, is the real claim primitive (optimistic concurrency);
      `git push --atomic` extends it to multi-ref. https://git-scm.com/docs/git-push
    • CORRECTION to an earlier assumption: a GitHub issue ASSIGNEE update is NOT an
      atomic lock (add-assignees is additive, PATCH is last-write-wins, no version
      check) — two agents can both self-assign. So `github-issues` is NOT
      automatically race-free; its atomic primitive is `Closes #N` via a merged PR /
      a single writer, not the assignee. https://docs.github.com/rest/issues/assignees
    • Rendezvous/HRW hashing (Thaler & Ravishankar 1998) > consistent hashing (no
      ring/vnodes) > modulo (catastrophic reshuffle on churn) for the partition.
      https://en.wikipedia.org/wiki/Rendezvous_hashing
    • Stale/crashed-agent claims: TTL leases + fencing tokens (Kleppmann, "How to do
      distributed locking") — fencing token = git commit hash / monotonic version.
      https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
    • Claude's task FORMAT validates ours: TodoWrite → Task tools
      (TaskCreate/TaskUpdate/TaskList) now carry `owner` (= our claim), `addBlockedBy`
      (= **Blocked by**), `status` pending/in_progress/completed. Convergent design.
      https://code.claude.com/docs/en/agent-sdk/todo-tracking

    2026-06-02 (c) TWO-TIER (team-of-machines × per-machine fleet) is now a MUST —
    reframes the design as HIERARCHICAL scheduling (cluster → node → worker):
    • Two failure domains, two leases: an AGENT dying (local coordinator reassigns
      instantly, in-process) vs a whole MACHINE going offline (its slice reclaimed by
      other machines only after a longer TTL). Different lease TTLs per tier.
    • Tier 1 (inter-machine, HARD — only an eventually-consistent git remote connects
      them): deterministic partition by MACHINE (HRW over the machine roster) so
      machines never contend; git-push CAS only for cross-machine *stealing* of a
      dead machine's slice. Coordination-free, offline-tolerant tier.
    • Tier 2 (intra-machine, EASY — shared filesystem): one per-host local coordinator
      (OS file-lock / in-proc queue) subdivides the machine's slice among its agents —
      exactly the single-host pattern every tool already solves (Claude Agent Teams'
      file-locking, claude-squad). No git round-trip for intra-host claims.
    • FLAT vs HIERARCHICAL partition: flat HRW over composite (machine,agent) ids is
      collision-free at both tiers in one step BUT needs every agent to know the
      GLOBAL roster of all agents everywhere. Hierarchical (HRW-by-machine, then local
      subdivide) needs only a global MACHINE roster (smaller, stabler) + local agent
      knowledge — scales better and localises churn. Lean: hierarchical.
    • Git contention at team×fleet scale: do NOT have every agent push its own claim
      (N machines × M agents pushing = remote thundering herd + constant TASKS.md
      rebase conflicts). Batch git I/O per MACHINE (one pusher/host) and keep claims
      as per-task FILES under `.tasks/claims/<id>` (distinct paths auto-merge; same
      path = clean conflict) instead of `(@agent)` suffixes on shared TASKS.md lines.
    • Identity must be (machine, agent)-unique, e.g. `@alice-mac/agent3`,
      `@ci-runner-7/agent1`; spec.md § Agent Identity needs a tier-aware convention.

    2026-06-02 (d) prior-art for the two-tier shape — hierarchical (cluster→node→
    worker) schedulers + git-at-scale (sub-agent reports archived this session):
    • Omega (Schwarzkopf et al., EuroSys 2013) — many schedulers on SHARED cluster
      state commit via atomic compare-and-swap; the loser retries on a fresh
      snapshot. This IS git-push-CAS — the most exact analog for the inter-machine
      tier. https://cs.brown.edu/people/malte/pub/papers/2013-eurosys-omega.pdf
    • Mesos two-level scheduling (Hindman et al., NSDI 2011) — master OFFERS a
      resource slice; the framework schedules its own tasks onto it. == a machine
      claims a slice, then its local coordinator subdivides among its agents.
      https://www.usenix.org/legacy/event/nsdi11/tech/full_papers/Hindman.pdf
    • Kubernetes — kube-scheduler atomically binds Pod→Node (one writer wins),
      kubelet runs pods locally; **Node Lease** objects are per-node TTL heartbeats,
      expiry → NotReady → evict+reschedule. == per-MACHINE TTL lease to reclaim a
      dead machine's slice. (Borg/Omega/K8s lineage: Burns et al., ACM Queue 2016.)
      https://kubernetes.io/docs/concepts/architecture/leases/
    • YARN (RM/NM/AM, 3-tier) + Nomad (optimistic plan-apply on a Raft snapshot,
      retry-on-stale) corroborate optimistic-CAS + per-tier liveness.
    • BOINC (Anderson 2004) — the UNTRUSTED-fleet answer: hand work units to many
      volunteer hosts with DEADLINES (leases) + deliberate REPLICATION + quorum
      VALIDATION instead of locks — accept duplicates, validate results. The fallback
      when a slice can't be locked (a team of mixed-trust machines is exactly that).
      https://github.com/BOINC/boinc/wiki/Job-replication
    • Erlang/OTP — hierarchical supervision trees + atomic global name registry
      (per-tier failure containment + restart).
    Git-at-scale (the inter-machine transport):
    • Per-task CLAIM FILES, not `(@agent)` line-suffixes: git auto-merges commits
      that ADD DIFFERENT files; same-line edits conflict. So `.tasks/claims/<id>` is
      conflict-free for distinct tasks, a clean one-winner conflict for the same task.
      Evidence: Mastra per-entity files, Conflux (CRDT schema-merge), Chisel sharding.
      Completions as an append-only `.tasks/log/` (event-sourced; IPFS-Log / grite
      git-WAL) stay conflict-free too.
    • Batch git I/O per MACHINE (one pusher/host) + `git push --atomic` (Git 2.4) +
      exponential backoff on non-ff rejection — else N×M agents pushing melts the
      remote (Gitaly/Praefect packed-refs lock contention; git HTTP 429 retry).
    • The inter-machine "single ordered writer" is exactly a MERGE QUEUE (Bors,
      GitHub Merge Queue, Zuul gating, Mergify, Graphite): a broker serialises pushes
      to one branch via speculative execution + bisection. Mergify's RCV theorem — a
      queue optimises only 2 of {reliability, cost, velocity}. Bors #875 (a batch
      started twice) warns: even a single-writer broker needs atomic state moves.
    • Hierarchical HRW is O(log n) (skeleton-based) and isolates churn to the
      affected machine; hierarchical-DHT research finds hierarchy beats flat for
      heterogeneous fleets — confirms the (c) lean toward machine-first partition.

    2026-06-02 (e) blank-page / GET-don't-IMPLEMENT — what already solves this TODAY,
    so we ADOPT + add tasks.md tags rather than build a coordinator (VISION G6/G7):
    • Atomic queue (battle-tested, multi-machine, two-tier-native NOW): pgmq
      (SQS-on-Postgres — visibility-timeout = lease, exactly-once-within-timeout,
      FIFO+groups) or River / pgq (Postgres SELECT … FOR UPDATE SKIP LOCKED). Each
      machine runs N workers all pulling one queue → atomic dequeue is collision-free
      across the whole team×fleet, deterministic outcome, crash-safe via the
      visibility lease. Thinnest path that fully meets the MUST when infra exists.
      https://github.com/pgmq/pgmq · https://github.com/riverqueue/river
    • Git-native, no server (matches the file-first soul) — already built, adopt/absorb:
      – zedutch/tq: "git-first agent-centric task queue using markdown files",
        `claimed_by` + machine name, pull-before/push-after. Closest to our exact model.
      – ThomasRohde/lodestar: multi-agent atomic claim + TTL LEASES + DAG deps +
        inter-agent messaging + an MCP server (stdio AND HTTP "for multiple agents");
        spec committed, runtime in local SQLite. Covers tier-2 + a broker today.
      – Nautilus-Cyberneering/git-queue: optimistic-lock mutual exclusion via empty
        git commits as an event store (event-sourced CAS) — proves the git-CAS claim.
    • MCP broker: run one `tasks-mcp` (HTTP) as the serialization point — exactly what
      lodestar already ships, and what spec.md § Limitations already names.
    DECISION REFRAME: tasks.md's durable value is NOT coordination (queues solved that
    ~15 yrs ago) — it's the portable, agent-readable layer (format + priority + tags +
    blocked-by + /next-task across 6+ agents). So the fix = a QUEUE/CLAIM BACKEND
    adapter behind the existing G5 seam (sibling to `github-issues`), mapping
    tasks.md tags → the backend's job metadata. Build the custom HRW + git-CAS layer
    ONLY for a zero-infra git-only mode, and even then adopt tq / lodestar / git-queue's
    mechanism rather than write a from-scratch scheduler.

    2026-06-02 (f) DECISION — git-native, file-based (operator call; rationale: agents
    are FILE-NATIVE — markdown + git is their working surface, a server queue is not):
    • Adopt/absorb the model from zedutch/tq — ONE markdown file per task with
      frontmatter (status, priority, `claimed_by` = machine, `claimed_at`); the tasks dir
      is a git repo; pull-before / push-after with machine identity. Proves file-native
      multi-machine claiming works — BUT tq is best-effort (no push-rejection verify), so
      it has the same race window we do.
    • Harden it with Nautilus git-queue's mechanism: optimistic-lock MUTUAL EXCLUSION via
      git commits (CAS). Claim = write `.tasks/claims/<id>` → commit → pull --rebase →
      push; on non-ff rejection, re-read and if now claimed by another, YIELD + pick next.
      That is the deterministic single-winner guarantee tq lacks.
    • lodestar is OUT for tier-1: its runtime/claim state is gitignored SQLite, so claims
      do NOT sync across machines via git. Keep it only as an optional tier-2 local
      coordinator / MCP broker.
    • Server queues (pgmq/River) drop to a NON-default backend — outside the file-native
      surface; offered only for teams already running that infra.
    Resulting git-native design: TASKS.md stays the human/agent-readable queue (G3);
    claims are a conflict-free `.tasks/claims/<id>` sidecar (per-task files auto-merge,
    same-path = clean one-winner conflict); git push is the CAS; a TTL-lease field
    reclaims dead machines; an optional HRW machine-partition cuts contention; a per-host
    file-lock coordinator handles the intra-machine tier. Fully file-based, no server,
    deterministic.

    2026-06-02 (g) cross-machine claim mechanism (online, ≤1-min sync; merge + CI):
    • WHERE claims live: a DEDICATED ref, NOT main — a `tasks-claims` branch (or
      `refs/notes/*` / `refs/tasks/*` where the host allows it), excluded from branch
      protection + CI. Main carries the queue (TASKS.md) + the actual work; the claims
      ref carries only the ephemeral per-task `.tasks/claims/<id>` ledger. This is the
      key CI decision: claim churn must never trigger the build pipeline or open a PR.
    • CLAIM = a git CAS: write `claims/<id>` → commit on the claims ref → push. FF →
      you won. Rejected (non-ff) → fetch/rebase: if `<id>` now exists, YIELD + pick next;
      else (you were claiming a different task) it is a clean different-file rebase →
      re-push. Different tasks = different files = auto-merge; SAME task = same path =
      the only real conflict, resolved deterministically (earliest claimed_at, then
      lexicographic machine/agent id) so both sides compute the same winner with no
      coordination — a custom merge driver / resolver, never a human conflict.
    • ≤1-MIN SYNC = a poll loop, and correctness is INDEPENDENT of it: each host
      coordinator fetches the claims ref + `pull --rebase` main every ~15s (worst-case
      staleness ~15–20s « 60s); claims are pushed IMMEDIATELY, not on the poll. A stale
      read only causes a doomed attempt the CAS rejects — never a double-claim. So the
      ≤1-min budget governs freshness + wasted attempts, not safety.
    • LEASES: the claim file carries claimed_at + renewed_at + lease_ttl + a fencing
      token; the owner re-pushes renewed_at every ~30s; a dead machine's lease expires
      (~90–120s) → another machine steals via the same CAS; the fencing token blocks a
      resurrected machine from clobbering the new owner.
    • PUSH CONTENTION (the real ceiling): one pusher per HOST batches its agents' claims
      (pushes scale with #machines, not #agents); the HRW machine-partition makes most
      pushes fast-forward instead of collide; if still hot, SHARD the claims ref
      (`tasks-claims-<k>` by hash(task-id)) to parallelize push throughput across refs.
    • CI: claims ref = no CI / no PR / no branch protection (direct push; Actions branch
      filters don't fire on a non-main branch — or `paths-ignore: .tasks/claims/**` if
      claims must live on main). The WORK product takes the normal feature-branch → PR →
      full CI → merge-to-main path (optionally a merge queue); completion removes the
      task from TASKS.md in that PR and deletes the claim file. Claiming stays sub-second
      and CI-free; only real code is gated.

    2026-06-02 (h) design refinement (folded into the plan; re-validated):
    • Claim ledger = an APPEND-ONLY EVENT LOG (`claimed`/`released`/`completed`/
      `cancelled`/`snapshot` as immutable `.tasks/events/<ulid>.json` files on a
      dedicated ref), not mutable `.tasks/claims/<id>` files. Winner of a task = the
      FIRST `claimed` event in the ref's commit order → no timestamp resolver, no merge
      driver, clock-skew-immune. Two-plane model: TASKS.md on main = the queue (tasks
      edited/deleted as plain markdown); the event log = who-owns-what-now.
    • RELIABILITY must be DETERMINISTIC, not skill-dependent (a `/next-task` skill can't
      guarantee an agent claims before working). Enforce via git hooks (`pre-push`
      blocks a work push for an unclaimed task; `post-merge` auto-fetches the ledger;
      `prepare-commit-msg` stamps `Task: <id>`) installed through committed
      `core.hooksPath`, PLUS branch protection on the ledger ref (no force/delete) and a
      required CI check (no merge to main without a live claim) — the server-side layers
      are bypass-proof on github.com; a `pre-receive` hook (GHE) is the optional
      strongest layer (`fleet-claim-server-enforcement`).
    • Must work in ANY adopting repo (e.g. oncall-hub-api) via ONE PROMPT:
      `tasks fleet init` (idempotent) wires the ledger ref + hooks + CI + best-effort
      branch protection + `/next-task` — an extension of the `one-prompt-setup` task.

    2026-06-02 (i) full prior-art research — `docs/research/fleet-claiming.md`. Key
    findings folded into the plan: (1) CORRECTION — "winner = first claimed in git commit
    order" is NOT deterministic (git's topo/date order has unstable ties); decide by an
    embedded Lamport total order `(lamport, actor_id, content_hash)` + keep the ledger
    linear (git-bug's proven model). (2) ADOPT git-bug's append-only-op-log-on-refs DESIGN
    (Go+GPL, so design not code) and `lefthook` for hook install (don't hand-roll). (3)
    Claims-ref default = a plain `tasks-claims` BRANCH (refs/notes unsupported on GitLab;
    custom refs aren't CI-visible). (4) GitHub ~6 pushes/min/REPO → per-host batching is
    needed (not optional) and ref-sharding within a repo can't dodge the per-repo limit; a
    sidecar repo can. (5) Server-side guarantee on github.com = Rulesets + a required
    status check (no pre-receive there; pre-receive is GHE/GitLab/Gitea). (6) Crowded
    field (Backlog.md, backlog.so, lodestar, railyard, agent-kanban) but the
    cross-machine-over-git-no-server niche (G7) is largely open. Adopt-X follow-ups:
    `fleet-claim-adopt-gitbug-model`, `fleet-claim-adopt-lefthook`.

    2026-06-02 (j) operator review — REFRAMED to PURE-SPEC (plan rewritten, re-validated):
    • tasks.md owns ONLY the spec + a runnable CONFORMANCE TEST SUITE + a THIN reference
      adapter (so the `tasks` CLI claims out-of-the-box) + one-prompt wiring. It builds NO
      ledger engine and NO orchestrator. The conformance suite — not source ownership — is
      how "requirements are provably met" for any backend.
    • REUSE git-bug for the ledger (do NOT reimplement). The exact reuse mechanism (binary
      shell-out vs library vs contribute a claim/lease entity upstream) is UNDECIDED →
      OPEN SPIKE `fleet-claim-gitbug-reuse-spike` (resolve before the adapter hardens; a
      GPL boundary is respected by shelling out, never linking).
    • ENFORCEMENT = full belt: lefthook (client) + GitHub Rulesets + required CI check
      (server, github.com) + `pre-receive` (GHE/GitLab/Gitea, strongest).
    • SCALE = medium (~tens of machines): per-host batching is IN the reference adapter
      (one pusher/host); a sidecar claims repo is the escape hatch (ref-sharding within a
      repo can't dodge GitHub's ~6 push/min/REPO limit); a queue backend only past the
      trip-wire.

    2026-06-02 (k) reuse spike DONE — `docs/research/gitbug-reuse-spike.md`. Ran a real
    two-clone git-bug v0.10.1 experiment: concurrent non-commutative edits to one
    entity, push (B rejected → pull/merge → push). The ledger FORKED + MERGED (DAG) yet
    BOTH clones AND a fresh independent re-clone folded to the SAME winner → git-bug's
    Lamport+lexicographic fold gives deterministic cross-clone resolution OUT OF THE BOX
    (no need to build ordering, no need for a linear ref). Mechanism findings: CLI
    exposes only bug/label/user (no custom entity); `entity/dag` is an importable Go lib
    but GPL-3.0; git-bug lacks TTL leases + snapshots. RECOMMENDED: git-bug via a
    separate GPL Go helper invoked as a subprocess (first-class Claim entity + TS stays
    MIT). OPEN DECISION surfaced: Option A git-bug (proven, GPL, build lease/snapshot)
    vs Option B grite (MIT, NATIVE leases+snapshots, immature) vs git-warp (TS-native,
    immature); Beads + git-appraise ruled out (non-deterministic). Adapter stays behind
    an interface → engine swappable; upstream CONTRIBUTE to git-bug runs in parallel.
  - **Files**: `docs/research/gitbug-reuse-spike.md` (reuse-mechanism spike),
    `docs/research/fleet-claiming.md` (prior-art research),
    `docs/plans/deterministic-fleet-claiming.md` (validated implementation
    plan — reviewer-approved 2026-06-02; the phased steps + acceptance below derive from
    it), `VISION.md` (G6 thinnest-layer + G7 fleet-primary + file-native belief —
    done), `spec.md` (§ Claiming — Limitations / Stale Claims; a new § "Fleet
    coordination" documenting the GIT-NATIVE model + tier-aware `@machine/agent`
    identity), `.tasksmd.json` (backend selector), a git-native claim adapter in
    `packages/cli/src/backend/` (per-task `.tasks/claims/<id>` files on a DEDICATED
    non-CI claims ref + git-CAS verify + TTL lease + heartbeat + a ≤1-min poll loop;
    tq-style frontmatter, git-queue-style optimistic lock; a deterministic same-task
    merge resolver), `packages/cli/src/backend/tasks-md.ts` (make `claim` the real
    git-CAS claim, not a no-op), `docs/user-stories/` (new git-native fleet-coordination
    story → G7), `examples/` (a two-tier team×fleet example), `.tasks/claims/` +
    `.tasks/agents/` conventions, plus CI config that EXCLUDES the claims ref /
    `.tasks/claims/**` from the build pipeline (claiming must never trigger CI or a PR).
    A server-queue adapter (pgmq/River) is an OPTIONAL non-default sibling; the
    HRW-partition + ref-sharding pieces are contention optimisations, not required for
    correctness.
  - **Acceptance**: The GIT-NATIVE backend (operator decision, Research (f)/(g)) is
    specified in spec.md § Claiming: claims as per-task `.tasks/claims/<id>` files
    (conflict-free multi-writer) on a dedicated ref excluded from CI + branch protection
    (never main); git-push CAS as the mutual-exclusion primitive (write → commit → pull
    --rebase → push → verify-won; loser yields and re-picks; same-task add/add resolved
    deterministically by earliest claimed_at then machine/agent id); a TTL lease +
    heartbeat for dead-machine reclaim; a per-host coordinator polling ≤ the freshness
    budget (≤1 min) and pushing claims immediately — TASKS.md stays the queue (G3). A new
    `docs/user-stories/` story makes two-tier git-native fleet coordination the primary
    use case (traces to G7). No-double-claim holds INDEPENDENT of sync lag (the push-CAS,
    not the poll, is the arbiter). Determinism is preserved — no probabilistic selection;
    existing `pickBestTask` tests pass. A test proves two agents — same machine OR
    different machines — never both win a claim (the loser's push is rejected and it
    yields), and a CI test asserts claim commits do not trigger the build pipeline. The
    model adopts/absorbs tq + git-queue rather than building a from-scratch scheduler
    (G6); a server-queue (pgmq/River) backend, if shipped at all, is an optional
    non-default. Remaining work is split into follow-up tasks each with its own
    acceptance.

## P1

- [ ] GitHub Issues backend: aggregate issue-backed repos alongside markdown repos in workspace mode
  - **ID**: github-issues-backend
  - **Tags**: parser, cli, mcp, next-task, github-issues, backend, workspace
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The single-repo GitHub Issues backend has shipped: `spec.md` § "Task backends" defines `tasks-md` (default) + `github-issues` (issue number ↔ id, `priority/P0..P3` label ↔ priority, assignee ↔ claim, `Closes #N` ↔ completion); the parser/CLI expose a backend-agnostic `Task` and `tasks pick`/`list`/`create`/`claim`/`complete` rank open issues on an issue-backed repo; the MCP server's task tools delegate to the `tasks` CLI for `github-issues` (`packages/mcp/src/backend.ts`); existing markdown-repo behavior is unchanged.

    The one remaining piece is **cross-backend aggregation**: when `workspace-mode-nested-repos` lands, its ranked aggregation must mix markdown repos and `github-issues` repos in a single list (a workspace repo may declare `task_backend: github-issues`). This is blocked until workspace mode exists — the backend-agnostic `Task` shape is already in place for it to build on.
  - **Files**: packages/cli/src/backend/, packages/mcp/src/backend.ts, packages/parser/src/
  - **Acceptance**: workspace-mode aggregation produces one priority-ranked list spanning both markdown and issue-backed repos; existing single-backend behavior unchanged.

- [ ] Workspace mode: parser, CLI, MCP, and `/next-task` aggregate TASKS.md files across nested repos in **one or more workspaces** on one host
  - **ID**: workspace-mode-nested-repos
  - **Tags**: spec, parser, cli, mcp, next-task, workspace, multi-repo, multi-workspace
  - **Details**: Operators frequently have **multiple** workspace folders on the same host, each containing many nested repos. The operator at 2026-05-12 has 5 workspaces under `~/apps/`:

    | Workspace root | Nested repos | TASKS.md count |
    |---|---|---|
    | `~/apps/tooling/` | 13 | 10 |
    | `~/apps/oncall-hub/` | 3 | 2 |
    | `~/apps/learning/` | 2 | 1 |
    | `~/apps/_inventory/` | 2 | 1 |
    | `~/apps/docs/` | 2 | 0 |

    Plus many standalone repos sitting directly under `~/apps/` (authproxy, career-advancement, code-smells, etc.) that are NOT workspaces — they're individual repos in the same parent directory.

    Today `/next-task` reads `./TASKS.md` only — there's no first-class way to (a) pick the highest-priority unblocked task across one workspace, OR (b) pick across all workspaces on the host. Friction scales with workspace count × repo count.

    The right answer is a workspace mode in the canonical tasks.md tooling, since the spec + parser + MCP + CLI are the load-bearing dependencies every other tool (agentbrew, dotfiles, minsky-observer) consumes. The design MUST support **multiple workspaces on one host** as a first-class concept — single-workspace mode is just N=1.

    **Outcome-shaped** (what a workspace-aware operator sees):

    1. Operator runs `tasks next` from anywhere — if `~/.config/tasks-md/workspaces.yaml` declares ≥ 1 workspace AND the operator didn't pass an explicit scope, the tool aggregates across **every declared workspace**, prints a one-line "scanned N workspaces, M repos, K unblocked", and picks the global highest-priority task.
    2. Operator can scope explicitly: `tasks --workspace ~/apps/tooling next` (one) OR `tasks --workspaces ~/apps/tooling,~/apps/oncall-hub next` (named list) OR `tasks --workspace tooling next` (config-name lookup).
    3. Output names the workspace + repo + task ID + title. Claiming the task and editing TASKS.md happens inside the corresponding repo's checkout.
    4. Cross-workspace `**Blocked by**:` references (e.g. `**Blocked by**: oncall-hub::api#fix-ratelimit`) are recognised and resolved. Cross-repo within-workspace (`**Blocked by**: agentbrew#agentfile-command-sources`) keeps working. Single-repo (`**Blocked by**: <task-id>`) keeps working.
    5. Auto-discovery: when no workspaces config exists, the CLI offers to scan `~/apps/` (or a configurable scan-root list) for `.tasks-md-workspace` sentinel files + writes the discovered workspaces into the config on operator approval.

    **Spec extension** (`spec.md`):

    - New § "Workspaces": a workspace is any directory marked by `.tasks-md-workspace` (sentinel file, similar to `.git`) OR a directory containing ≥ 2 immediate child dirs each carrying a `TASKS.md`. The sentinel takes precedence and may declare repo discovery globs explicitly.
    - New § "Multiple workspaces on one host": multiple workspaces are declared in a per-user config at `~/.config/tasks-md/workspaces.yaml` (XDG-friendly; honours `$XDG_CONFIG_HOME`). One workspace per machine is `N=1` of the same model — there is no separate "single workspace" code path.
    - Cross-workspace blocker reference: `**Blocked by**: <workspace-name>::<repo-name>#<task-id>` (workspace name comes from the config; defaults to last-path-segment of the workspace root). Cross-repo within-workspace: `<repo-name>#<task-id>`. Single-repo: `<task-id>`. The colon-colon is the workspace separator (analogous to C++ namespace syntax — operator-friendly + spec-stable).
    - `~/.config/tasks-md/workspaces.yaml` schema (YAML):

      ```yaml
      workspaces:
        - name: tooling
          root: ~/apps/tooling
          # optional:
          exclude: ["archived-repo"]
          priorityWeight: 1.0
        - name: oncall-hub
          root: ~/apps/oncall-hub
          priorityWeight: 0.8
      discovery:
        scanRoots: [~/apps]   # where auto-detect looks for .tasks-md-workspace sentinels
        autoDetect: true       # when true, `tasks next` offers to add discovered workspaces
      ```

      `priorityWeight` is optional per-workspace modifier when two workspaces' priorities legitimately differ in user importance (P0-in-tooling beats P1-in-oncall-hub by default; raising `oncall-hub`'s weight inverts that without rewriting any task block).
    - `.tasks-md-workspace` per-workspace schema (YAML): same as before but adds nothing global — purely local to the workspace.

    **Implementation surfaces**:

    - `@tasks-md/parser`: new `parseWorkspaces(roots: string[]): Map<workspaceRoot, ParsedTask[]>` returning per-workspace results. New `parseWorkspace(root)` returning single-workspace results (delegates to `parseWorkspaces([root])`). Single-file `parse()` stays unchanged.
    - `tasks` CLI:
      - `--workspace <path>` (singular) — one workspace
      - `--workspaces <path1,path2,...>` (plural, comma-separated)
      - `--workspace-name <name>` — looks up the workspace by name from the config
      - default behaviour (no flag): if `~/.config/tasks-md/workspaces.yaml` exists AND has ≥ 1 entry, aggregate across all declared. Otherwise fall through to single-`./TASKS.md` mode (preserves backwards compat).
      - `tasks workspaces list` — prints discovered + configured workspaces.
      - `tasks workspaces add <path> [--name <name>]` — adds to the config.
      - `tasks workspaces detect [--scan-root <path>]` — scans for sentinels, prompts to add.
    - `tasks-mcp` (MCP server): new tool `find_next_task_across_workspaces({workspaces?: string[]})` — when `workspaces` is omitted, reads the per-user config. Returns `{workspace, repo, task_id, file_path}`. The existing `find_next_task` stays single-repo for backwards compat.
    - `commands/next-task.md` canonical source: a new step `0. Workspace detection` — if `~/.config/tasks-md/workspaces.yaml` declares ≥ 1 workspace, surface "Configured workspaces (N): tooling (10 repos), oncall-hub (3 repos). Pick across all, scope to one, or single-repo? [all/<name>/single]" before falling through to single-repo. If the config doesn't exist BUT auto-detect finds sentinels, offer the one-time add. All 6 generated agent variants regenerate via `npx tasks generate-commands`.

    Cross-repo dependencies on this feature: agentbrew gains a workspace-aware `agentbrew sync --workspaces <list>` (filed as a companion task in that repo); dotfiles gains a `dotfiles-doctor` workspace section that iterates every declared workspace (companion task there).
  - **Files**: `spec.md` (§ Workspaces + § Multiple workspaces on one host), `examples/workspace.md` (new — example workspace) + `examples/multi-workspace-host.md` (new — N=2+ example), `packages/parser/src/workspace.ts` (new, both `parseWorkspace` + `parseWorkspaces`), `packages/parser/src/workspace.test.ts` (new, paired), `packages/cli/src/commands/next.ts` (extend with `--workspace` / `--workspaces` / `--workspace-name`), `packages/cli/src/commands/lint.ts` (extend), `packages/cli/src/commands/list.ts` (extend), `packages/cli/src/commands/workspaces.ts` (new — `list` / `add` / `detect`), `packages/cli/src/config/workspaces.ts` (new — reads/writes `~/.config/tasks-md/workspaces.yaml`), `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.ts` (new), `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.test.ts` (new), `commands/next-task.md` (canonical workspace step), `commands/lint-tasks.md` (workspace flag), `README.md` (workspace + multi-workspace quickstart), all 6 generated agent variants under `commands/<agent>/` (regenerated via `npx tasks generate-commands`).
  - **Acceptance**: (a) `tasks --workspaces ~/apps/tooling,~/apps/oncall-hub next` exits 0 + prints `<workspace>::<repo>:<task-id>` for the highest-priority unblocked task across both; (b) `parseWorkspaces([root1, root2])` returns per-workspace task lists; (c) cross-workspace `**Blocked by**: <workspace>::<repo>#<task-id>` is recognised + resolved; (d) `tasks workspaces list` prints both configured and auto-detected workspaces; (e) `tasks workspaces add ~/apps/oncall-hub --name oncall-hub` writes to `~/.config/tasks-md/workspaces.yaml`; (f) `tasks-mcp` exposes `find_next_task_across_workspaces`; (g) `commands/next-task.md` step list regenerated across all 6 agents; (h) `npm run build && npm test` pass; (i) `npx tasks generate-commands` is clean (commands-drift CI gate); (j) backwards compat: when no workspaces config exists, `tasks next` still reads `./TASKS.md` unchanged.
  - **Surfaced-by**: operator multi-workspace setup at `~/apps/` containing 5 workspaces (`tooling`, `oncall-hub`, `learning`, `_inventory`, `docs`) as of 2026-05-12, plus 60+ standalone individual repos that are NOT workspaces. The Minsky observer plugin shipped 2026-05-12 surfaced the cross-repo task-filing pattern within one workspace (`tooling`) — extending to N workspaces on one host is the same architectural arc.

## P2

## P3

- [ ] Set up custom domain for GitHub Pages
  - **ID**: set-up-github-pages-custom-domain
  - **Tags**: docs, github-pages, domain, public-write
  - **Blocked**: needs-user-approval — buying or configuring a public
    domain/DNS and GitHub Pages custom domain is an external public action that
    requires explicit current-session operator approval.
  - **Details**: Site is live at tasksmd.github.io/tasks.md/. Consider buying tasks.md
    domain for a cleaner URL.
  - **Research**: 2026-05-02 — custom-domain setup notes
    Repo has no `CNAME` file. The current published URL appears in `README.md`
    as `https://tasksmd.github.io/tasks.md/`, and `scripts/build-site.js`
    generates `docs/index.html` from `docs/template.html`, `spec.md`, and
    `commands/`. Once domain ownership/configuration is approved, expect to add
    the GitHub Pages `CNAME` file or Pages setting, update the README website
    link, and rebuild `docs/index.html` if the rendered site needs the new URL.
    Approval needed before any domain purchase, DNS change, Pages custom-domain
    setting, or remote GitHub write.
  - **Files**: `README.md`, `scripts/build-site.js`, `docs/index.html`
  - **Last-enriched**: 2026-05-02

- [ ] Groom TASKS.md per 2026-05-21 companion sweep
  - **ID**: tasks-groom-2026-05-21-companion
  - **Tags**: tasks, grooming, companion
  - **Details**:
    Generated by `companion-task-groom` on 2026-05-21.
    Lint status: pass — `npx -y @tasks-md/lint TASKS.md` exits 0
    with 0 errors. Total tasks before this append: 3 (P2: 2,
    P3: 1). Findings (1):

    1. [worker-fixable] `set-up-github-pages-custom-domain`
       (P3, line 129). Carries `**ID**`, `**Tags**`,
       `**Blocked**`, `**Details**`, `**Research**`, `**Files**`,
       and `**Last-enriched**`, but no `**Acceptance**` line.
       The spec lists Acceptance as optional, but the
       finish-line here is concrete (CNAME committed, Pages
       setting points at the new domain, README link updated,
       `docs/index.html` rebuilt against the new URL — all
       behind explicit operator approval for the external DNS
       / Pages change). Action: append an `**Acceptance**`
       line capturing those criteria so a future agent knows
       what "done" looks like.

    Suggested resolution path: worker (or operator) reviews
    the finding and either updates the underlying task,
    removes it with reasoning in the commit message, or
    explicitly defers. Once the finding is addressed,
    remove THIS grooming task in the same commit and confirm
    `npx -y @tasks-md/lint TASKS.md` still passes.

    Bucket counts: worker-fixable=1, probable-dead=0,
    stale-claim=0, duplicate=0, spec-violation=0.

    Companion-sweep notes:
    - Archived project task entries have been removed in a prior
      commit.
    - The remaining task was last-enriched 2026-05-02 (19 days
      before this sweep), so it has cleared the 7-day
      enrichment cooldown from spec.md § "Enriching blocked
      tasks". No fresh-cooldown skips this round.
    - No `(@agent-id)` claims appear on any task, so no
      stale-claim findings to file.
    - No `TASKS-AUDIT.md` exists and `README.md`, `AGENTS.md`,
      and `spec.md` make no mention of the `sweep` convention,
      so all findings are batched inline here instead of
      staged to a separate audit file.
  - **Files**: `TASKS.md`
  - **Acceptance**: The finding above is
    addressed — task updated in-place, removed with reasoning
    in the commit message, or explicitly deferred with a
    documented rationale appended to the task. After
    resolution, this grooming task is removed in the same
    commit. Lint passes: `npx -y @tasks-md/lint TASKS.md`.
