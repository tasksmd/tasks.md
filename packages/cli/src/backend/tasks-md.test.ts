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

  it("complete returns an ok operation result", async () => {
    const result = await createTasksMdBackend(dir).complete("fix-urgent");
    expect(result).toMatchObject({ status: "ok", operation: "complete", taskId: "fix-urgent" });
  });

  it("cancel removes the block like complete", async () => {
    const result = await createTasksMdBackend(dir).cancel("fix-urgent");
    expect(result).toMatchObject({ status: "ok", operation: "cancel" });
    expect(readFileSync(join(dir, "TASKS.md"), "utf-8")).not.toContain("fix-urgent");
  });

  it("claim then release strips the (@owner) suffix", async () => {
    const backend = createTasksMdBackend(dir);
    await backend.claim("fix-urgent", { actorId: "@alice" });
    expect(readFileSync(join(dir, "TASKS.md"), "utf-8")).toContain("(@alice)");
    const result = await backend.release("fix-urgent");
    expect(result.status).toBe("ok");
    expect(readFileSync(join(dir, "TASKS.md"), "utf-8")).not.toContain("(@alice)");
  });

  it("release on an unclaimed task is a no-op", async () => {
    const result = await createTasksMdBackend(dir).release("fix-urgent");
    expect(result.status).toBe("noop");
  });

  it("update is unsupported (file backend is human-editable)", async () => {
    const result = await createTasksMdBackend(dir).update("fix-urgent", { title: "x" });
    expect(result.status).toBe("unsupported");
    expect(result.reason).toMatch(/human-editable/);
  });

  it("render returns the TASKS.md contents", async () => {
    const result = await createTasksMdBackend(dir).render();
    expect(result.status).toBe("ok");
    expect(result.content).toContain("# Tasks");
    expect(result.content).toContain("fix-urgent");
  });
});
