# Tasks

## P0 — Critical

- [ ] Fix shared `@myorg/ui` build breaking downstream packages
  - **Details**: The `tsconfig.json` in `packages/ui` emits ESM but `packages/web` expects CJS. Align module format.
  - **Files**: `packages/ui/tsconfig.json`, `packages/web/tsconfig.json`
  - **Acceptance**: `pnpm build` succeeds across all packages

## P1 — Important

- [ ] Extract authentication logic into `@myorg/auth` package
  - **Details**: Auth code is duplicated in `packages/web` and `packages/api`. Create shared package.
  - **Files**: `packages/auth/` (new), `packages/web/src/auth/`, `packages/api/src/auth/`
  - [ ] Create `packages/auth/` with package.json and tsconfig
  - [ ] Move shared auth utilities from web and api
  - [ ] Update imports in both consumers
  - [ ] Add tests for the new package

- [ ] Upgrade TypeScript to 5.7 across all packages
  - **Details**: Currently on 5.4. Update root `tsconfig.base.json` and resolve any new strict errors.
  - **Blocked by**: "Fix shared @myorg/ui build breaking downstream packages"

## P2 — Nice to Have

- [ ] Add changeset bot for automated version bumps
- [ ] Consolidate duplicate ESLint configs into `@myorg/eslint-config`
