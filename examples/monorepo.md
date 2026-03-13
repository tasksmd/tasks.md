# Tasks
Spec v0.5

## P0

- [ ] Fix shared @myorg/ui build breaking downstream packages
  - **ID**: ui-build-fix
  - **Details**: The `tsconfig.json` in `packages/ui` emits ESM but `packages/web` expects CJS. Align module format.
  - **Files**: `packages/ui/tsconfig.json`, `packages/web/tsconfig.json`
  - **Acceptance**: `pnpm build` succeeds across all packages

## P1

- [ ] Extract authentication logic into @myorg/auth package
  - **Details**: Auth code is duplicated in `packages/web` and `packages/api`. Create shared package.
  - **Files**: `packages/auth/`, `packages/web/src/auth/`, `packages/api/src/auth/`
  - [ ] Create `packages/auth/` with package.json and tsconfig
  - [ ] Move shared auth utilities from web and api
  - [ ] Update imports in both consumers
  - [ ] Add tests for the new package

- [ ] Upgrade TypeScript to 5.7 across all packages
  - **Details**: Currently on 5.4. Update root `tsconfig.base.json` and resolve any new strict errors.
  - **Blocked by**: ui-build-fix

## P2

- [ ] Add changeset bot for automated version bumps
- [ ] Consolidate duplicate ESLint configs into @myorg/eslint-config

<!-- Cross-file blocker example:
     If packages/api/TASKS.md had a task with **Blocked by**: ui-build-fix,
     the agent would search all TASKS.md files and find ui-build-fix here
     in the root file. The blocker resolves when ui-build-fix is completed
     and removed from this file. -->
