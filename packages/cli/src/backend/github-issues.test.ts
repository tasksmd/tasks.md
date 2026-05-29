import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubIssuesBackend } from "./github-issues.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExec = vi.mocked(execFileSync);

/** Mock the auth pre-flight (first call) + the operation output (second call). */
function mockGh(opOutput: string) {
  mockExec
    .mockReturnValueOnce(Buffer.from("") as never) // gh auth status
    .mockReturnValueOnce(opOutput as never); // the operation
}

function backend() {
  return createGitHubIssuesBackend({ label: "tasks.md" });
}

beforeEach(() => vi.resetAllMocks());

describe("github-issues backend", () => {
  it("is named GitHub Issues", () => {
    expect(backend().name).toBe("GitHub Issues");
  });

  it("throws a helpful error when gh is not authenticated", async () => {
    mockExec.mockImplementationOnce(() => {
      throw new Error("not logged in");
    });
    await expect(backend().listOpen()).rejects.toThrow("gh CLI is not authenticated");
  });

  it("listOpen maps number/priority/tags/assignee and sorts by priority", async () => {
    mockGh(
      JSON.stringify([
        {
          number: 7,
          title: "low one",
          labels: [{ name: "tasks.md" }, { name: "priority/p3" }, { name: "docs" }],
          assignees: [],
        },
        {
          number: 3,
          title: "urgent one",
          labels: [{ name: "tasks.md" }, { name: "priority/p0" }],
          assignees: [{ login: "alice" }],
        },
      ]),
    );
    const tasks = await backend().listOpen();
    expect(tasks.map((t) => t.id)).toEqual(["3", "7"]); // P0 before P3
    expect(tasks[0]).toMatchObject({ id: "3", priority: "P0", assignee: "alice" });
    expect(tasks[1]).toMatchObject({ id: "7", priority: "P3", tags: ["docs"] });
  });

  it("listOpen returns [] on empty output", async () => {
    mockGh("[]");
    expect(await backend().listOpen()).toEqual([]);
  });

  it("reads the looser priority vocabulary (critical/high/...)", async () => {
    mockGh(
      JSON.stringify([
        { number: 1, title: "x", labels: [{ name: "tasks.md" }, { name: "critical" }], assignees: [] },
      ]),
    );
    expect((await backend().listOpen())[0].priority).toBe("P0");
  });

  it("next returns the top-priority UNassigned task", async () => {
    mockGh(
      JSON.stringify([
        { number: 3, title: "claimed P0", labels: [{ name: "tasks.md" }, { name: "priority/p0" }], assignees: [{ login: "bob" }] },
        { number: 9, title: "free P1", labels: [{ name: "tasks.md" }, { name: "priority/p1" }], assignees: [] },
      ]),
    );
    const task = await backend().next();
    expect(task?.id).toBe("9");
  });

  it("create passes title/body/marker+priority labels and parses the new url", async () => {
    mockGh("https://github.com/o/r/issues/123\n");
    const task = await backend().create({ title: "Do a thing", priority: "P1", body: "why", tags: ["infra"] });
    expect(task).toMatchObject({ id: "123", title: "Do a thing", priority: "P1" });

    const args = mockExec.mock.calls[1][1] as string[];
    expect(args.slice(0, 2)).toEqual(["issue", "create"]);
    expect(args).toEqual(expect.arrayContaining(["--title", "Do a thing", "--body", "why"]));
    expect(args).toEqual(expect.arrayContaining(["--label", "tasks.md"]));
    expect(args).toEqual(expect.arrayContaining(["--label", "priority/P1"]));
    expect(args).toEqual(expect.arrayContaining(["--label", "infra"]));
  });

  it("claim self-assigns via gh issue edit", async () => {
    mockGh("");
    await backend().claim("42");
    const args = mockExec.mock.calls[1][1] as string[];
    expect(args).toEqual(["issue", "edit", "42", "--add-assignee", "@me"]);
  });

  it("complete closes the issue", async () => {
    mockGh("");
    await backend().complete("42");
    const args = mockExec.mock.calls[1][1] as string[];
    expect(args).toEqual(["issue", "close", "42"]);
  });

  it("threads --repo through when configured", async () => {
    mockExec.mockReturnValueOnce(Buffer.from("") as never).mockReturnValueOnce("" as never);
    await createGitHubIssuesBackend({ label: "tasks.md", repo: "o/r" }).complete("5");
    const args = mockExec.mock.calls[1][1] as string[];
    expect(args).toEqual(["issue", "close", "5", "--repo", "o/r"]);
  });
});
