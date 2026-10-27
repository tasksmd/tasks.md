// Root vitest config, shared by every package.
// TASKS_EVENTS=0: tests and the CLIs they spawn never write the user's event log.
// TASKS_POSTHOG_KEY="" and DO_NOT_TRACK=1: no test reads the Keychain or sends telemetry.
export default { test: { env: { TASKS_EVENTS: "0", TASKS_POSTHOG_KEY: "", DO_NOT_TRACK: "1" } } };
