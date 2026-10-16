// Keep workspace tests isolated from parent-directory Vitest configs.
// TASKS_EVENTS=0: tests and the CLIs they spawn never write the user's event log.
export default { test: { env: { TASKS_EVENTS: "0" } } };
