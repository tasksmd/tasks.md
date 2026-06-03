# Tasks

<!-- policy: Tech-lead-curated queue (2026-05-03). Focus is hardening
     user stories and simplifying CLI features. Pick tasks in priority
     order. Do NOT roam beyond `tasks.md` repo. -->

## P0

- [ ] Restore npm release publishing for `v0.9.0` and future releases
  - **ID**: npm-release-publishing-blocker
  - **Tags**: release, deployment-infra, npm, ci, trusted-publishing, p0
  - **Blocked**: needs-npm-maintainer-auth — npm package trust/access settings require maintainer auth for `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; unauthenticated `npm trust list` returns E401 and the npm package access UI redirects to login.
  - **Details**: GitHub release `v0.9.0` exists, but publish workflow run `26844766304` failed at `npm publish --access=public --provenance` for `@tasks-md/parser@0.9.0` with `npm error code E404` / `404 Not Found - PUT https://registry.npmjs.org/@tasks-md%2fparser`. npm latest remains `0.7.0` for all four packages. The previous `v0.8.0` token-based workflow run `26240628732` failed with the same package PUT E404, so the unblock is package-level npm authorization, not tests/build. Preferred fix: as an npm maintainer, configure trusted publishing for each package using `npm trust github <pkg> --repo tasksmd/tasks.md --file publish.yml --allow-publish --registry=https://registry.npmjs.org/`, or replace `NPM_TOKEN` with a package-scoped granular token that has read-write publish permission and bypasses 2FA. See `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`.
  - **Files**: `.github/workflows/publish.yml`, `packages/*/package.json`, `docs/human-blocked-actions/npm-release-publishing-2026-06-02.md`
  - **Acceptance**: (a) each package has either a trusted publisher for `tasksmd/tasks.md` + `.github/workflows/publish.yml` with publish allowed, or the repo `NPM_TOKEN` secret is replaced by a valid publish-capable token; (b) rerunning the `v0.9.0` publish workflow or creating a replacement release publishes `@tasks-md/parser`, `@tasks-md/lint`, `@tasks-md/cli`, and `tasks-mcp`; (c) `npm view @tasks-md/parser version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/lint version --registry=https://registry.npmjs.org/`, `npm view @tasks-md/cli version --registry=https://registry.npmjs.org/`, and `npm view tasks-mcp version --registry=https://registry.npmjs.org/` all return `0.9.0` or newer; (d) the release workflow's version-bump commit lands on `main`; (e) `npm run lint` and `npx -y @tasks-md/lint TASKS.md` pass.

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
      dedicated ref), not mutable `.tasks/claims/<id>` files. Earlier drafts used commit
      order as the winner; later research superseded that with strict linear-CAS for v1, or
      Lamport ordering if forks/merges are introduced. Two-plane model: generated TASKS.md
      on main = the snapshot; the event log = who-owns-what-now.
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
    findings folded into the plan: (1) CORRECTION — a commit-order claim winner is NOT
    deterministic (git's topo/date order has unstable ties); decide by an
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
    but GPL-3.0; git-bug lacks TTL leases + snapshots. FALLBACK IF CRDT IS NEEDED:
    git-bug via a separate GPL Go helper invoked as a subprocess (first-class Claim entity
    + TS stays MIT). OPEN DECISION surfaced: Option A git-bug (proven, GPL, build lease/snapshot)
    vs Option B grite (MIT, NATIVE leases+snapshots, immature) vs git-warp (TS-native,
    immature); Beads + git-appraise ruled out (non-deterministic). Adapter stays behind
    an interface → engine swappable; upstream CONTRIBUTE to git-bug runs in parallel.

    2026-06-02 (l) operator review of the spike: engine choice DEFERRED — keep it behind
    the adapter interface and choose at implementation time by prototyping the top
    candidates against the conformance suite; upstream contribution NOT NOW. Broadened
    candidate sweep DONE (~15 tools, in the spike doc): Radicle Collaborative Objects
    RULED OUT (generic CRDT-on-git but hard-requires the Radicle P2P network — not
    GitHub-syncable); sit/ipfs-log/ticgit unmaintained; OrbitDB/Fossil wrong substrate.
    Two reuse families: full engines (git-bug/grite/Beads) vs CRDT cores you wrap
    (Automerge/Yjs/git-warp). Prototype shortlist: git-bug (proven baseline), grite
    (native leases, MIT), Automerge-on-git (mature CRDT + TS-native).

    2026-06-02 (m) FULL-PLAN edge-case Q&A — the plan is now the definitive v1 design.
    Locked decisions: SINGLE REPO ONLY, no sidecar (ledger on a `tasks-claims` ref in the
    same repo). NO DUPLICATION / log-first: the claim log is the sole source of truth for
    state; TASKS.md is a single-writer generated snapshot, never hand-edited in git-native
    mode. Identity = `<actor-id>/<instance-id>` with privacy-safe rendering. Claims carry a
    `claim_id` fencing token, and implementation commits carry both `Task:` and
    `Task-Claim:` trailers parsed with `git interpret-trailers`. Contention = optimistic
    linear-CAS + silent retry/backoff + STATELESS id-hashed pick-dispersion. Failure =
    release-back-to-queue or lease expiry. Blocked-by = unclaimable until unblocked.

    2026-06-02 (n) independent (fresh-context) review found a BLOCKER + majors; resolved
    them while keeping the vision. Fixes: (1) rename to COLLISION-FREE (not
    "deterministic" — that oversold; the guarantee is collision-freedom via git ref-CAS).
    (2) FULLY log-first: the `tasks-claims` log is the SOLE source of state; TASKS.md is a
    SINGLE-WRITER GENERATED SNAPSHOT on main — agents never edit it, so it's conflict-free
    by construction (kills the original one-file-merge problem). (3) Enforcement deadlock
    resolved by a PATH-SCOPED required check (code→needs a claim; TASKS.md/docs→pass) that
    never bypasses CI — corporate-safe. (4) Engine is linear-CAS first; CRDT/git-bug/grite/
    Automerge-on-git is deferred until conformance or measured contention proves need.
    (5) Status downgraded to design-approved/integration-UNPROVEN (the git-bug spike
    proved only generic convergence). (6) PHASED: v1 = collision-free core; leases+offline
    (P2), server enforcement (P3), CRDT engine+HRW (P4, only if measured). (7) assume-online
    made an explicit precondition. (8) conformance starts as an internal workspace package;
    public self-certification waits until file, GitHub Issues, and git-native adapters
    exercise the same harness. Prior "validations" were the same resumed reviewer (not
    independent) — future reviews use a fresh context.
  - **Files**: `docs/research/gitbug-reuse-spike.md` (reuse-mechanism spike),
    `docs/research/fleet-claiming.md` (prior-art research),
    `docs/plans/deterministic-fleet-claiming.md` (implementation plan — design-approved,
    integration-UNPROVEN; collision-free, fully-log-first, phased v1; the steps +
    acceptance below derive from it), `VISION.md` (G6 thinnest-layer + G7 fleet-primary +
    backend-scoped truth — done), `spec.md` (§ "Fleet coordination" documenting the
    GIT-NATIVE log-first model), `.tasksmd.json` (backend selector), an internal
    `packages/conformance/` harness, a git-native claim adapter in
    `packages/cli/src/backend/`, `packages/cli/src/backend/tasks-md.ts` (honest
    file-backend capability flags), `docs/user-stories/` (new git-native
    fleet-coordination story → G7), `examples/` (a two-tier team×fleet example), plus
    projection workflow + lefthook config. A server-queue adapter (pgmq/River) is an
    OPTIONAL non-default sibling; HRW, per-host batching, and CRDT engines are measured
    optimisations, not v1 requirements.
  - **Acceptance**: The GIT-NATIVE backend is specified in spec.md as an append-only
    `tasks-claims` event log that is excluded from normal CI but consumed by projection and
    claim-check workflows; `TASKS.md` is a single-writer generated snapshot, not live state.
    Events have canonical serialization, schema versions, privacy-safe actor IDs, and
    `claim_id` fencing tokens. The internal conformance harness proves same-task races have
    exactly one winner, different-task races preserve both events, stale snapshots do not
    affect picks, generated snapshots are byte-idempotent, and path-scoped enforcement
    rejects non-doc changes without matching `Task:`/`Task-Claim:` trailers. The reference
    adapter runs linear-CAS first and only adds a reused CRDT engine if conformance or
    contention metrics require it. Setup uses lefthook and documented Rulesets via `gh api`,
    Terraform, or Probot Settings rather than bespoke hook/ruleset managers. Remaining work
    is split into follow-up tasks each with its own acceptance.

- [ ] Add Phase 2 robust leases, heartbeats, crash recovery, and log compaction
  - **ID**: fleet-phase2-leases-heartbeats-compaction
  - **Tags**: stability, git-native, leases, heartbeat, crash-recovery, compaction, offline
  - **Details**: The v1 plan intentionally assumes always-on machines and uses long leases as a cheap dead-owner backstop. That assumption is honest but incomplete: mixed fleets will include sleeping laptops, crashed agent processes, interrupted pushes, and long-lived logs. File the Phase 2 stability work explicitly so it is not lost after v1 ships.

    Required changes:
    1. Define heartbeat semantics, renewal cadence, and stale-owner fencing behavior.
    2. Add crash-recovery flows for agents that restart with or without their prior instance ID.
    3. Add log snapshot/compaction rules that keep fold performance bounded while preserving auditability.
    4. Extend conformance with heartbeat expiry, restart, compaction, and snapshot-roundtrip cases.
    5. Document when laptop/offline fleets become supported and what remains out of scope.
  - **Files**: `spec.md`, `packages/conformance/`, `packages/cli/src/backend/git-native.ts`, `packages/cli/src/commands/doctor.ts`, `docs/plans/deterministic-fleet-claiming.md`, `README.md`
  - **Acceptance**: Lease renewal and expiry are specified and tested; restarted agents cannot complete with stale fencing data; compacted logs fold to the same state as full logs; `tasks doctor` reports stale heartbeats and compaction health; docs remove the always-on limitation only where Phase 2 is actually implemented.

- [ ] Add Phase 3 server-side path-scoped enforcement for protected repos
  - **ID**: fleet-phase3-server-side-enforcement
  - **Tags**: deployment-infra, ci, github-rulesets, pre-receive, enforcement, security, git-native
  - **Details**: v1 client hooks are ergonomic and bypassable. Repos that need an unbypassable claim gate need the Phase 3 server-side layer promised by the plan: a path-scoped required check on hosted platforms and server hooks where available. This is deployment infrastructure and must be a first-class task, not a vague future phase.

    Required changes:
    1. Add a reusable required-check workflow that rejects non-markdown changes without a live claim and matching `Task-Claim` fencing token, and passes markdown-only changes, including generated `TASKS.md` snapshots.
    2. Use `git interpret-trailers` for `Task:` / `Task-Claim:` parsing and writing instead of custom commit-message regex.
    3. Add GitHub Repository Rulesets setup guidance via `gh api`, Terraform, or Probot Settings for protecting `main` and the `tasks-claims` ref without force-push/delete loopholes; do not build a bespoke repo-settings manager unless these are blocked.
    4. Add a GHE/GitLab/Gitea `pre-receive` reference implementation or documented recipe using the same path logic.
    5. Cover executable files under `docs/` so docs-directory code cannot bypass the claim gate.
    6. Make `tasks doctor` report whether server-side enforcement is absent, advisory, or hard-enforced.
  - **Files**: `.github/workflows/`, `scripts/`, `packages/cli/src/commands/doctor.ts`, `docs/security/git-native-claims-threat-model.md`, `README.md`, `spec.md`
  - **Acceptance**: A code change without a live claim and matching `Task-Claim` token fails the required check; markdown-only changes pass; generated `TASKS.md` snapshot PRs pass by the same path rule as human docs changes; `tasks-claims` cannot be force-pushed or deleted in the documented GitHub setup; server-hook recipe covers GHE/GitLab/Gitea; tests cover code-under-docs.

- [ ] Add contention observability and Phase 4 scale tripwires before adopting CRDT or HRW work
  - **ID**: fleet-phase4-contention-observability
  - **Tags**: observability, git-native, scale, crdt, hrw, contention, reuse
  - **Details**: The plan says CRDT adoption, HRW partitioning, and per-host batching only happen if measured contention proves the v1 CAS path insufficient. There is currently no task to collect those measurements or define the tripwire. Add that feedback loop before anyone starts building Phase 4 machinery by intuition.


    Required changes:
    1. Instrument claim attempts, non-fast-forward rejects, retry counts, backoff duration, claim latency, and pushes/minute against the remote.
    2. Add `tasks doctor` or `tasks fleet stats` output that summarizes contention without leaking task contents.
    3. Define numeric tripwires for when to revisit CRDT engine adoption, HRW partitioning, or per-host batching.
    4. Add a quarterly "Replace? Relocate?" check per the reuse rule: can an upstream engine now replace the adapter?
  - **Files**: `packages/cli/src/backend/git-native.ts`, `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/fleet-stats.ts` (new), `docs/research/gitbug-reuse-spike.md`, `docs/plans/deterministic-fleet-claiming.md`
  - **Acceptance**: Fleet stats report contention metrics; thresholds are documented; no Phase 4 CRDT/HRW implementation task can proceed without measured data crossing a threshold or a written operator override; reuse re-evaluation is scheduled/documented.

- [ ] Align repo and downstream agent instructions with backend-aware task policy
  - **ID**: agent-instructions-backend-policy
  - **Tags**: docs, agents, contributing, instructions, agent-owned, backend, drift
  - **Details**: The public docs are not the only place teaching the old model. This repo's `AGENTS.md`, `CONTRIBUTING.md`, and the global agent-rule snippets operators copy into other repos still say to claim by appending `(@agent)` and hand-edit `TASKS.md`. After the backend-aware commands exist, publish one canonical Task Queue Policy snippet and update this repo's instructions so agents stop learning the wrong default.

    Required changes:
    1. Update `AGENTS.md` and `CONTRIBUTING.md` so direct file edits and inline claim trailers are explicitly file-backend behavior, not universal guidance.
    2. Add a canonical backend-aware policy snippet that other `AGENTS.md` / `CLAUDE.md` / Cursor-rule files can copy.
    3. Explain how an agent determines the active backend before claiming, completing, or adding tasks.
    4. Preserve current repo workflow while this repo remains on the file backend: `TASKS.md` is still valid here until git-native mode is configured.
    5. File or document downstream follow-ups for global instructions outside this repo rather than silently leaving known drift.
  - **Files**: `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/user-stories/`, `docs/templates/`
  - **Acceptance**: `AGENTS.md` and `CONTRIBUTING.md` no longer present append-claim/direct-edit as backend-agnostic rules; a copyable backend-aware policy snippet exists; docs explain the transition for repos still using the file backend; known downstream global-rule drift is recorded with exact file paths and replacement text.

- [ ] Align package READMEs and the generated site with backend-aware operations
  - **ID**: package-docs-site-backend-alignment
  - **Tags**: docs, package-readmes, site, cli, mcp, parser, lint, backend
  - **Details**: The root README task covers public narrative docs, but package-level READMEs are independent entry points. `packages/mcp/README.md` currently describes direct file mutation tools, `packages/cli/README.md` describes a file-only command set, and parser/lint docs frame claims as inline file syntax. Align those docs and rebuild the generated site so npm users do not install stale semantics.

    Required changes:
    1. Update CLI docs for backend selection, operation commands, and JSON result shapes.
    2. Update MCP docs so mutation tools are backend-mediated and unsupported operations return typed statuses.
    3. Update parser/lint docs to distinguish file-format parsing from backend state semantics.
    4. Rebuild `docs/index.html` and any generated docs that embed README/spec excerpts.
    5. Keep all file-backend examples valid while labeling them as file-backend examples.
  - **Files**: `packages/cli/README.md`, `packages/mcp/README.md`, `packages/parser/README.md`, `packages/lint/README.md`, `docs/index.html`, `scripts/build-site.js`, `README.md`
  - **Acceptance**: Every package README describes backend-aware behavior consistently with the root docs; MCP docs do not promise file-only mutation semantics for every backend; parser/lint docs stay scoped to format validation; `npm run build:site` regenerates a clean site; package docs contain no universal stale "append `(@agent)`" instructions.

- [ ] Add mechanical drift checks so docs cannot regress to the old human-edit workflow
  - **ID**: docs-drift-agent-owned-task-model
  - **Tags**: lint, docs, ci, drift, agent-owned, feedback-loop
  - **Blocked by**: agent-instructions-backend-policy, package-docs-site-backend-alignment
  - **Details**: The fresh review found many stale docs because the vision changed faster than the spec, README, commands, repo instructions, package docs, and user stories. Per the feedback-loop rule, recurring doc/model drift should become a deterministic check, not just a review comment. Add a lightweight CI/lint guard that catches universal claims like "edit TASKS.md directly" or "append `(@agent)`" outside file-backend-specific sections.

    Required changes:
    1. Add a repo-local script or lint rule that scans docs/commands for banned or backend-scoped phrases.
    2. Allow the phrases in explicit file-backend sections and examples.
    3. Wire the check into CI or `npm run lint`.
    4. Document how to update the allowlist when wording changes intentionally.
  - **Files**: `scripts/`, `package.json`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `commands/`, `docs/user-stories/`, `packages/*/README.md`
  - **Acceptance**: The check fails on a deliberately added universal "humans edit TASKS.md" or "append `(@agent)`" instruction outside file-backend context; legitimate file-backend docs pass; repo instructions and package READMEs are scanned; `npm run lint` includes the guard; CI stays green.

## P1

- [ ] GitHub Issues backend: aggregate issue-backed repos alongside markdown repos in workspace mode
  - **ID**: github-issues-backend
  - **Tags**: parser, cli, mcp, next-task, github-issues, backend, workspace
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The single-repo GitHub Issues backend has shipped: `spec.md` § "Task backends" defines `tasks-md` (default) + `github-issues` (issue number ↔ id, `priority/P0..P3` label ↔ priority, assignee ↔ claim, `Closes #N` ↔ completion); the parser/CLI expose a backend-agnostic `Task` and `tasks pick`/`list`/`create`/`claim`/`complete` rank open issues on an issue-backed repo; the MCP server's task tools delegate to the `tasks` CLI for `github-issues` (`packages/mcp/src/backend.ts`); existing markdown-repo behavior is unchanged.

    The one remaining piece is **cross-backend aggregation**: when `workspace-mode-nested-repos` lands, its ranked aggregation must mix markdown repos and `github-issues` repos in a single list (a workspace repo may declare `task_backend: github-issues`). This is blocked until workspace mode exists — the backend-agnostic `Task` shape is already in place for it to build on.
  - **Files**: packages/cli/src/backend/, packages/mcp/src/backend.ts, packages/parser/src/
  - **Acceptance**: workspace-mode aggregation produces one priority-ranked list spanning both markdown and issue-backed repos; existing single-backend behavior unchanged.

- [ ] Publish backend conformance docs and a self-certification path only after adapter stability
  - **ID**: backend-conformance-self-certification
  - **Tags**: conformance, backend, docs, ecosystem, adapters, no-lock-in, adoption
  - **Details**: G4/G5 promise that every backend works behind one surface, but publishing conformance before multiple real adapters pass would freeze an unstable API. Keep the harness internal until file, GitHub Issues, and git-native adapters have exercised the contract. Then publish the adapter contract, runner docs, sample adapter, and report format so external backends can self-certify without copying internal tests.

    Required changes:
    1. Verify the internal harness has run against file, GitHub Issues, and git-native adapters, with explicit skips for unsupported capability classes.
    2. Document how a backend implements the `TaskBackend` contract and runs the conformance suite.
    3. Provide a minimal fixture adapter and an intentionally broken adapter so users can see pass/fail behavior.
    4. Emit a machine-readable conformance report that can be linked from backend docs or CI.
    5. Define self-certification language: what "passes tasks.md conformance" means and what it does not mean.
    6. Add npm/README guidance for backend authors without making tasks.md a backend registry yet.
  - **Files**: `packages/conformance/README.md`, `packages/conformance/examples/`, `packages/cli/src/backend/types.ts`, `README.md`, `spec.md`, `docs/user-stories/`
  - **Acceptance**: The harness is proven against at least file, GitHub Issues, and git-native adapters before public self-certification docs ship; a third-party backend author can run the conformance suite from a README without reading source; the report format is documented; broken-adapter output is understandable; conformance docs explicitly distinguish file compatibility, operation compatibility, and collision-free claim compatibility.

- [ ] Define fleet-safe workspace and cross-repo claiming semantics
  - **ID**: fleet-claim-workspace-semantics
  - **Tags**: workspace, git-native, fleet, backend, multi-repo, multi-workspace, claiming
  - **Blocked by**: workspace-mode-nested-repos
  - **Details**: The approved fleet plan is explicitly single-repo v1, while workspace mode aggregates many repos and backends. Before making workspace mode fleet-aware, define the semantics: a global workspace picker may rank across repos, but claims are written to the selected repo's backend. Cross-repo/cross-workspace blockers must be read consistently without pretending there is a global atomic transaction.

    Required changes:
    1. Specify how workspace aggregation discovers each repo's backend and capability flags.
    2. Define claim flow for a ranked cross-workspace pick: pick globally, claim atomically in the target repo backend, then re-rank on claim loss.
    3. Define cross-repo blocker resolution when some repos use file backend and others use git-native or issues.
    4. State what is not supported: atomic multi-repo claim/complete, global leases spanning repos, and cross-repo generated snapshot writes unless a later backend provides them.
    5. Add conformance or integration tests for two agents racing through workspace aggregation into the same target repo.
  - **Files**: `spec.md`, `packages/parser/src/workspace.ts`, `packages/cli/src/commands/next.ts`, `packages/mcp/src/tools/findNextTaskAcrossWorkspaces.ts`, `packages/conformance/`, `README.md`
  - **Acceptance**: Workspace docs explain per-repo backend capabilities; concurrent workspace picks cannot both claim the same target-repo task when that repo uses git-native; mixed-backend limitations are explicit; tests cover claim-loss re-rank and cross-repo blocker resolution.

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
  - **Acceptance**: Behind explicit operator approval for the external DNS / Pages change: a `CNAME` file (or the GitHub Pages custom-domain setting) points the site at the purchased domain; the README website link is updated to the new domain; `docs/index.html` is rebuilt via `npm run build:site` against the new URL; `npm run build:site` and `npx -y @tasks-md/lint TASKS.md` pass.
  - **Last-enriched**: 2026-05-02
