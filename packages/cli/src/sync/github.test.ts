import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGitHubSource } from "./github.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExecSync = vi.mocked(execSync);

/**
 * Helper: mock auth check (no encoding, returns Buffer) + issue list (encoding: utf-8, returns string)
 */
function mockGhCalls(issueListOutput: string) {
  mockExecSync
    .mockReturnValueOnce(Buffer.from("") as never)   // gh auth status
    .mockReturnValueOnce(issueListOutput as never);   // gh issue list (encoding: utf-8 → string)
}

describe("createGitHubSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a source with name and idPrefix", () => {
    const source = createGitHubSource();
    expect(source.name).toBe("GitHub Issues");
    expect(source.idPrefix).toBe("issue-");
  });

  it("uses default label 'tasks.md'", () => {
    const source = createGitHubSource();
    mockGhCalls("[]");
    source.fetchIssues();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('--label "tasks.md"'),
      expect.any(Object)
    );
  });

  it("uses custom label when provided", () => {
    const source = createGitHubSource({ label: "sync" });
    mockGhCalls("[]");
    source.fetchIssues();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('--label "sync"'),
      expect.any(Object)
    );
  });

  it("includes --repo flag when repo is provided", () => {
    const source = createGitHubSource({ repo: "owner/repo" });
    mockGhCalls("[]");
    source.fetchIssues();
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("--repo owner/repo"),
      expect.any(Object)
    );
  });

  it("omits --repo flag when repo is not provided", () => {
    const source = createGitHubSource();
    mockGhCalls("[]");
    source.fetchIssues();
    const cmd = mockExecSync.mock.calls[1][0] as string;
    expect(cmd).not.toContain("--repo");
  });
});

describe("fetchIssues", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when gh CLI is not authenticated", async () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error("not logged in");
    });
    const source = createGitHubSource();
    await expect(source.fetchIssues()).rejects.toThrow(
      "gh CLI not authenticated"
    );
  });

  it("returns empty array when gh issue list fails", async () => {
    mockExecSync
      .mockReturnValueOnce(Buffer.from("") as never)
      .mockImplementationOnce(() => {
        throw new Error("network error");
      });
    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("returns empty array when output is empty string", async () => {
    mockGhCalls("");
    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("returns empty array when output is empty JSON array", async () => {
    mockGhCalls("[]");
    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("maps issues correctly with all fields", async () => {
    const ghIssues = [
      {
        number: 42,
        title: "Fix login bug",
        body: "The login form crashes",
        labels: [
          { name: "tasks.md" },
          { name: "p1" },
          { name: "frontend" },
        ],
      },
    ];
    mockGhCalls(JSON.stringify(ghIssues));

    const source = createGitHubSource();
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      id: "issue-42",
      title: "Fix login bug",
      priority: 1,
      tags: ["frontend"],
      description: "The login form crashes",
    });
  });

  it("maps multiple issues from response", async () => {
    const ghIssues = [
      { number: 1, title: "First", body: "", labels: [{ name: "tasks.md" }] },
      { number: 2, title: "Second", body: "", labels: [{ name: "tasks.md" }] },
      { number: 3, title: "Third", body: "", labels: [{ name: "tasks.md" }] },
    ];
    mockGhCalls(JSON.stringify(ghIssues));

    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.id)).toEqual(["issue-1", "issue-2", "issue-3"]);
  });

  it("sets description to undefined when body is empty", async () => {
    const ghIssues = [
      { number: 1, title: "No body", labels: [{ name: "tasks.md" }] },
    ];
    mockGhCalls(JSON.stringify(ghIssues));

    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues[0].description).toBeUndefined();
  });

  it("defaults to P2 when no priority labels present", async () => {
    const ghIssues = [
      { number: 1, title: "Default priority", body: "", labels: [{ name: "tasks.md" }, { name: "docs" }] },
    ];
    mockGhCalls(JSON.stringify(ghIssues));

    const source = createGitHubSource();
    const issues = await source.fetchIssues();
    expect(issues[0].priority).toBe(2);
  });
});

describe("priority mapping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeIssue(labels: string[]) {
    return [
      {
        number: 1,
        title: "Test",
        body: "",
        labels: labels.map((name) => ({ name })),
      },
    ];
  }

  async function getPriority(labels: string[], filterLabel = "tasks.md") {
    mockGhCalls(JSON.stringify(makeIssue(labels)));
    const source = createGitHubSource({ label: filterLabel });
    const issues = await source.fetchIssues();
    return issues[0].priority;
  }

  it("maps 'critical' to P0", async () => {
    expect(await getPriority(["tasks.md", "critical"])).toBe(0);
  });

  it("maps 'p0' to P0", async () => {
    expect(await getPriority(["tasks.md", "p0"])).toBe(0);
  });

  it("maps 'high' to P1", async () => {
    expect(await getPriority(["tasks.md", "high"])).toBe(1);
  });

  it("maps 'p1' to P1", async () => {
    expect(await getPriority(["tasks.md", "p1"])).toBe(1);
  });

  it("maps 'medium' to P2", async () => {
    expect(await getPriority(["tasks.md", "medium"])).toBe(2);
  });

  it("maps 'low' to P3", async () => {
    expect(await getPriority(["tasks.md", "low"])).toBe(3);
  });

  it("maps 'p3' to P3", async () => {
    expect(await getPriority(["tasks.md", "p3"])).toBe(3);
  });

  it("picks highest priority when multiple priority labels exist", async () => {
    expect(await getPriority(["tasks.md", "low", "critical"])).toBe(0);
  });

  it("is case-insensitive for priority labels", async () => {
    expect(await getPriority(["tasks.md", "HIGH"])).toBe(1);
  });
});

describe("tag extraction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function getTags(labels: string[], filterLabel = "tasks.md") {
    const ghIssues = [
      {
        number: 1,
        title: "Test",
        body: "",
        labels: labels.map((name) => ({ name })),
      },
    ];
    mockGhCalls(JSON.stringify(ghIssues));
    const source = createGitHubSource({ label: filterLabel });
    const issues = await source.fetchIssues();
    return issues[0].tags;
  }

  it("excludes the filter label from tags", async () => {
    const tags = await getTags(["tasks.md", "frontend"]);
    expect(tags).not.toContain("tasks.md");
    expect(tags).toContain("frontend");
  });

  it("excludes priority labels from tags", async () => {
    const tags = await getTags(["tasks.md", "p1", "frontend", "critical"]);
    expect(tags).not.toContain("p1");
    expect(tags).not.toContain("critical");
    expect(tags).toContain("frontend");
  });

  it("lowercases tag names", async () => {
    const tags = await getTags(["tasks.md", "Frontend", "API"]);
    expect(tags).toEqual(["frontend", "api"]);
  });

  it("returns empty array when only filter and priority labels", async () => {
    const tags = await getTags(["tasks.md", "high"]);
    expect(tags).toEqual([]);
  });

  it("excludes custom filter label from tags", async () => {
    const tags = await getTags(["sync", "frontend"], "sync");
    expect(tags).not.toContain("sync");
    expect(tags).toContain("frontend");
  });
});
