
## Workflow: Next Task

**CRITICAL: Always pick a task and implement it. Never respond with "nothing to do" or "waiting for pipelines". If pipelines occupy some files, pick a task that touches different files. If the user specifies a task name, work on that task. If all server files are busy, work on skills, tests, docs, config, or switch to another repo.**

### Step 1: Determine repo

Check the user's active document path or explicit instruction. Use the workspace root of the active file. If ambiguous, ask.

### Step 2: Auto-detect repo tooling

Detect the repo's tooling stack by checking for config files. **Do not hardcode commands — discover them.**

1. **Default branch**: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` — falls back to `main` if unset
2. **Package manager**: `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `Gemfile.lock` → bundler, `go.mod` → go
3. **Test runner**: Read `scripts.test` from `package.json`, or `Makefile` test target, or `pytest.ini`/`setup.cfg`
4. **Type check**: `tsconfig.json` exists → `npx tsc --noEmit` (or `--build` if workspaces), `mypy.ini` → `mypy .`
5. **Linter**: `biome.json` → `npx biome check .`, `.eslintrc*` → `npx eslint .`, `Makefile` lint target → `make lint`
6. **Formatter**: `biome.json` → biome, `.prettierrc*` → prettier
7. **Verify command**: `scripts.verify` from `package.json` if present, otherwise chain: typecheck + lint + test
8. **Monorepo**: `workspaces` in `package.json` or `nx.json` → run commands from monorepo root

Store detected config mentally — do NOT re-detect on every step.

### Step 3: Quick health check (30 seconds max)

1. `git status --short` — commit or discard stray changes
2. Check Bosun pipeline summary (if server reachable) — note active pipelines and which files they touch
3. If any pipelines are FAILED, delete and note for re-launch after your task

### Step 4: Pick the next task

1. Read `tasks.md` in the repo root
2. Find the highest-priority **unblocked** task
3. If the user named a specific task, use that one
4. If a pipeline is actively modifying the same files, pick the **next** unblocked task that touches different files
5. **Fallback priority** (if all queue tasks conflict with pipelines):
   - Fix failing tests
   - Fix type errors or lint issues
   - Update AGENTS.md or README with recent changes
   - Clean up dead code, unused exports, stale imports
   - Switch to another repo and work there

### Step 5: Implement

- Make minimal, focused edits
- Write tests before or alongside code
- Commit incrementally with conventional commit messages

### Step 6: Verify

Run the repo's full verification suite (detected in Step 2) before pushing.

### Step 7: Commit & push

- `git add`, `git commit`, `git pull --rebase origin <default-branch>`, `git push`
- If rebase conflicts: resolve, `GIT_EDITOR=true git rebase --continue`
- **Never `git reset --hard` on main checkout**

### Step 8: Update queue

- Remove completed task from `tasks.md`
- Add session note if needed
- Do NOT update hardcoded counts in docs
- Commit and push the queue update

### Step 9: Re-launch failed pipelines

If any pipelines were FAILED in step 3, re-launch them now that there's a free slot.