# Tasks

## P0

- [ ] Fix Android build crash on React Native 0.76 upgrade
  - **ID**: android-build-crash
  - **Details**: `npx react-native run-android` fails with Gradle 8.x incompatibility.
    Update `android/gradle/wrapper/gradle-wrapper.properties` to 8.10.2 and
    `android/build.gradle` `classpath` to AGP 8.7.0. Clear caches with `cd android && ./gradlew clean`.
  - **Files**: `android/gradle/wrapper/gradle-wrapper.properties`, `android/build.gradle`
  - **Acceptance**: `npx react-native run-android` builds and launches on emulator

## P1

- [ ] Add biometric authentication for iOS and Android
  - **Tags**: auth, feature
  - **Details**: Use `react-native-keychain` with `accessControl: BIOMETRY_ANY`.
    Store auth token in secure keychain after first login.
    Prompt biometric on app foreground if token exists.
    Fall back to PIN entry on biometric failure.
  - **Files**: `src/auth/BiometricAuth.tsx`, `src/hooks/useBiometric.ts`
  - **Blocked by**: android-build-crash

- [ ] Add offline-first data sync with WatermelonDB
  - **Tags**: data, feature
  - **Details**: Replace direct API calls with WatermelonDB local-first storage.
    Define schemas for `tasks` and `projects` tables. Sync adapter
    pushes/pulls changes to REST API on network reconnect.
  - **Files**: `src/db/schema.ts`, `src/db/sync.ts`, `src/models/Task.ts`
  - **Acceptance**: App works offline, syncs when reconnected, no data loss

## P2

- [ ] Add Detox E2E tests for login and task creation flows
  - **Tags**: testing
  - **Details**: Configure Detox for both iOS simulator and Android emulator.
    Test flows: login → create task → mark complete → verify list updates.
    Run in CI with `detox test --configuration ios.sim.release`.
  - **Files**: `e2e/login.test.ts`, `e2e/tasks.test.ts`, `.detoxrc.js`
  - **Acceptance**: `detox test` passes on both platforms
- [ ] Add push notifications via Firebase Cloud Messaging
  - **Details**: Use `@react-native-firebase/messaging`. Handle foreground, background,
    and quit-state notifications. Deep-link to task detail on tap.
- [ ] Reduce iOS bundle size below 15MB
  - **Tags**: performance
  - **Details**: Run `npx react-native-bundle-visualizer`. Remove unused native pods.
    Enable Hermes for both platforms. Strip debug symbols in release builds.

