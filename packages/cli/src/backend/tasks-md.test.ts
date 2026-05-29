import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTasksMdBackend } from "./tasks-md.js";

let dir: string;
const SAMPLE = `# Tasks

## P0

- [ ] Fix the urgent thing
  - **ID**: fix-urgent
  - **Tags**: bug

## P1

- [ ] Build a feature
  - **ID**: build-feature
  - **Tags**: feature
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tasksmd-be-"));
  writeFileSync(join(dir, "TASKS.md"), SAMPLE);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tasks-md backend", () => {
  it("listOpen returns tasks sorted by priority", async () => {
    const tasks = await createTasksMdBackend(dir).listOpen();
    expect(tasks.map((t) => t.id)).toEqual(["fix-urgent", "build-feature"]);
    expect(tasks[0]).toMatchObject({ priority: "P0", tags: ["bug"] });
  });

  it("next returns the highest-priority task", async () => {
    const task = await createTasksMdBackend(dir).next();
    expect(task?.id).toBe("fix-urgent");
  });

  it("create appends a task under the right priority section", async () => {
    const created = await createTasksMdBackend(dir).create({ title: "New thing", priority: "P1", tags: ["x"] });
    expect(created.id).toBe("new-thing");
    const content = readFileSync(join(dir, "TASKS.md"), "utf-8");
    expect(content).toContain("- [ ] New thing");
    expect(content).toContain("**ID**: new-thing");
    // it lands in the P1 section, after the P1 header
    expect(content.indexOf("## P1")).toBeLessThan(content.indexOf("New thing"));
  });

  it("complete removes the task block from the file", async () => {
    await createTasksMdBackend(dir).complete("fix-urgent");
    const content = readFileSync(join(dir, "TASKS.md"), "utf-8");
    expect(content).not.toContain("fix-urgent");
    expect(content).toContain("build-feature"); // others untouched
  });

  it("complete throws for an unknown id", async () => {
    await expect(createTasksMdBackend(dir).complete("nope")).rejects.toThrow(/No TASKS.md task/);
  });
});
