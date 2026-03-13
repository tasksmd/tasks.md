<!-- tasks-spec: 0.3 -->
# Tasks

## P0

- [ ] Fix shared `@myorg/ui` build breaking downstream packages `#ui-build-fix`
  - **Details**: The `tsconfig.json` in `packages/ui` emits ESM but `packages/web` expects CJS. Align module format.
  - **Files**: `packages/ui/tsconfig.json`, `packages/web/tsconfig.json`
  - **Acceptance**: `pnpm build` succeeds across all packages

## P1

- [ ] Extract authentication logic into `@myorg/auth` package `#extract-auth`
  - **Details**: Auth code is duplicated in `packages/web` and `packages/api`. Create shared package.
  - **Files**: `packages/auth/`, `packages/web/src/auth/`, `packages/api/src/auth/`
  - [ ] Create `packages/auth/` with package.json and tsconfig
  - [ ] Move shared auth utilities from web and api
  - [ ] Update imports in both consumers
  - [ ] Add tests for the new package

- [ ] Upgrade TypeScript to 5.7 across all packages `#ts-upgrade`
  - **Details**: Currently on 5.4. Update root `tsconfig.base.json` and resolve any new strict errors.
  - **Blocked by**: `#ui-build-fix`

## P2

- [ ] Add changeset bot for automated version bumps
- [ ] Consolidate duplicate ESLint configs into `@myorg/eslint-config`
