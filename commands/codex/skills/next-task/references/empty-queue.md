### Empty queue: roam to the next repo {#empty-queue}

When the current repo's queue is truly empty (no unclaimed, unblocked tasks):

1. **Scan for work across repos:**

```bash
# Find all TASKS.md files in ~/apps/
for repo in ~/apps/*/; do
  tasks_file="$repo/TASKS.md"
  [ -f "$tasks_file" ] || continue
  # Count unclaimed, unblocked tasks per priority (P0 first)
  p0=$(grep -c '^\- \[ \]' "$tasks_file" 2>/dev/null | head -1)
  blocked_by=$(grep -c '\*\*Blocked by\*\*:' "$tasks_file" 2>/dev/null | head -1)
  blocked=$(grep -c '\*\*Blocked\*\*:' "$tasks_file" 2>/dev/null | head -1)
  actionable=$((p0 - blocked_by - blocked))
  [ "$actionable" -gt 0 ] && echo "$repo $actionable"
done
```

2. **Pick the repo with the highest-priority work** (most P0 > most P1 > most total).
   Read each candidate's TASKS.md to verify tasks are truly actionable (not just recurring/watch tasks).

3. **Switch without asking:**
   ```
   Switching to ~/apps/<repo> (N actionable tasks)
   ```
   Then `cd` to that repo and restart the next-task loop from the top.

4. **If ALL repos are empty/blocked**, run the [audit cascade](#audit-cascade).

### Audit cascade {#audit-cascade}

Run these tiers **in order** on the current repo. Stop as soon as any tier produces actionable findings — write them as tasks to TASKS.md and implement the highest-priority one immediately.

**The audit is re-runnable.** Every time you reach this point (queue empty, all repos checked), run the full cascade from Tier 1. Code changes between sessions may introduce new findings. Never treat a previous audit as "permanently done."

**Tier 1 — Verify**
- `git pull --rebase` and prune stale worktrees (`git worktree list`)
- Run the full verify suite: typecheck, lint, test, build
- Any failure → write a task, fix it

**Tier 2 — Security & dead code**
- Hardcoded secrets, missing input validation, unsafe patterns
- Dead exports, unused variables, unreachable code paths
- Actionable `TODO`, `FIXME`, `HACK` comments

**Tier 3 — Doc drift & stale references**
- README examples vs actual behavior
- AGENTS.md with outdated build/test commands
- Stale comments referencing changed or deleted code
- Broken links in docs

**Tier 4 — Dependency modernization** *(applies to every repo type)*
- Node.js: outdated packages, deprecated APIs, missing lockfile entries
- Rust: `cargo outdated`, deprecated crate features
- Python: pinned versions with known CVEs, deprecated stdlib usage
- Shell/Markdown repos: outdated tool references, broken install instructions, stale CI action versions
- Any repo: LICENSE accuracy, .gitignore completeness, CI config drift

**Tier 5 — DX polish** *(applies to every repo type)*
- Help text accuracy: do `--help` outputs match actual behavior?
- Error message quality: are failures actionable or cryptic?
- Naming consistency: file names, function names, CLI flags vs project conventions
- Onboarding friction: can a new contributor clone → run in < 5 minutes?
- Example accuracy: do code examples in docs actually work when copy-pasted?

**After each tier:** if you found issues, write tasks to TASKS.md (with ID, Tags, Details, Files, Acceptance) and start working on the highest-priority one. Do not continue to the next tier — fixing a real issue is more valuable than completing the audit.

### Terminal state {#terminal-state}

If ALL five tiers produce zero findings across ALL repos:

1. Print a final summary exactly once:
   ```
   All [N] repos scanned. Audit clean across 5 tiers. Nothing to do — stopping.
   Repos checked: [list]
   ```
2. **Stop the loop.** Do not print "nothing to do" again on subsequent invocations in the same session.
3. If the user invokes `/next-task` again (new session), re-run the full loop from the top — starting with the context snapshot. The audit is fresh each session.
