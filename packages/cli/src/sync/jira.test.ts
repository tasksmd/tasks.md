import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createJiraSource } from "./jira.js";

describe("createJiraSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when JIRA_URL is not set", () => {
    delete process.env.JIRA_URL;
    delete process.env.JIRA_TOKEN;
    expect(() => createJiraSource({ project: "PROJ" })).toThrow(
      "JIRA_URL environment variable not set"
    );
  });

  it("throws when JIRA_TOKEN is not set", () => {
    process.env.JIRA_URL = "https://jira.example.com";
    delete process.env.JIRA_TOKEN;
    expect(() => createJiraSource({ project: "PROJ" })).toThrow(
      "JIRA_TOKEN environment variable not set"
    );
  });

  it("throws when neither --project nor --jql is provided", () => {
    process.env.JIRA_URL = "https://jira.example.com";
    process.env.JIRA_TOKEN = "token123";
    expect(() => createJiraSource({})).toThrow(
      "--project or --jql is required"
    );
  });

  it("returns a source with name and idPrefix", () => {
    process.env.JIRA_URL = "https://jira.example.com";
    process.env.JIRA_TOKEN = "token123";
    const source = createJiraSource({ project: "PROJ" });
    expect(source.name).toBe("Jira");
    expect(source.idPrefix).toBe("jira-");
  });
});

describe("fetchIssues", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JIRA_URL = "https://jira.example.com";
    process.env.JIRA_TOKEN = "dG9rZW4=";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses Basic auth by default", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    await source.fetchIssues();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Basic dG9rZW4=",
        }),
      })
    );
  });

  it("uses Bearer auth when JIRA_AUTH=bearer", async () => {
    process.env.JIRA_AUTH = "bearer";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    await source.fetchIssues();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer dG9rZW4=",
        }),
      })
    );
  });

  it("calls the correct Jira API URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    await source.fetchIssues();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://jira.example.com/rest/api/2/search");
    expect(url).toContain("project+%3D+PROJ");
  });

  it("uses custom JQL when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ jql: "assignee = me" });
    await source.fetchIssues();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("assignee");
  });

  it("throws on non-OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );
    const source = createJiraSource({ project: "PROJ" });
    await expect(source.fetchIssues()).rejects.toThrow(
      "Jira API returned HTTP 401"
    );
  });

  it("returns empty array when no issues in response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("maps issues correctly with all fields", async () => {
    const jiraResponse = {
      issues: [
        {
          key: "PROJ-42",
          fields: {
            summary: "Fix login bug",
            description: "The login page crashes",
            priority: { name: "High" },
            labels: ["frontend", "urgent"],
          },
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      id: "jira-PROJ-42",
      title: "Fix login bug",
      priority: 1,
      tags: ["frontend", "urgent"],
      description: "The login page crashes",
    });
  });

  it("maps multiple issues from response", async () => {
    const jiraResponse = {
      issues: [
        { key: "PROJ-1", fields: { summary: "First", priority: { name: "High" }, labels: [] } },
        { key: "PROJ-2", fields: { summary: "Second", priority: { name: "Low" }, labels: [] } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.id)).toEqual(["jira-PROJ-1", "jira-PROJ-2"]);
  });

  it("sets description to undefined when field is empty", async () => {
    const jiraResponse = {
      issues: [
        { key: "PROJ-1", fields: { summary: "No desc", priority: { name: "Medium" }, labels: [] } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    expect(issues[0].description).toBeUndefined();
  });

  it("lowercases labels for tags", async () => {
    const jiraResponse = {
      issues: [
        { key: "PROJ-1", fields: { summary: "Tags test", priority: { name: "Medium" }, labels: ["Frontend", "API"] } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    expect(issues[0].tags).toEqual(["frontend", "api"]);
  });

  it("respects custom maxResults", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ", maxResults: 50 });
    await source.fetchIssues();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("maxResults=50");
  });

  it("defaults maxResults to 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ issues: [] }), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    await source.fetchIssues();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("maxResults=200");
  });
});

describe("priority mapping", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JIRA_URL = "https://jira.example.com";
    process.env.JIRA_TOKEN = "token123";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function getPriority(priorityName: string) {
    const jiraResponse = {
      issues: [
        { key: "PROJ-1", fields: { summary: "Test", priority: { name: priorityName }, labels: [] } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    return issues[0].priority;
  }

  it("maps 'Highest' to P0", async () => {
    expect(await getPriority("Highest")).toBe(0);
  });

  it("maps 'Blocker' to P0", async () => {
    expect(await getPriority("Blocker")).toBe(0);
  });

  it("maps 'Critical' to P0", async () => {
    expect(await getPriority("Critical")).toBe(0);
  });

  it("maps 'High' to P1", async () => {
    expect(await getPriority("High")).toBe(1);
  });

  it("maps 'Medium' to P2", async () => {
    expect(await getPriority("Medium")).toBe(2);
  });

  it("maps 'Low' to P3", async () => {
    expect(await getPriority("Low")).toBe(3);
  });

  it("maps 'Lowest' to P3", async () => {
    expect(await getPriority("Lowest")).toBe(3);
  });

  it("defaults to P2 for unknown priority names", async () => {
    expect(await getPriority("Custom")).toBe(2);
  });

  it("defaults to P2 when priority field is missing", async () => {
    const jiraResponse = {
      issues: [
        { key: "PROJ-1", fields: { summary: "No priority", labels: [] } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(jiraResponse), { status: 200 })
    );
    const source = createJiraSource({ project: "PROJ" });
    const issues = await source.fetchIssues();
    expect(issues[0].priority).toBe(2);
  });
});
