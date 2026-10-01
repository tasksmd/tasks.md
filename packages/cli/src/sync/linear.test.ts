import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLinearSource } from "./linear.js";

describe("createLinearSource", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when LINEAR_API_KEY is not set", () => {
    delete process.env.LINEAR_API_KEY;
    expect(() => createLinearSource({ team: "ENG" })).toThrow(
      "LINEAR_API_KEY environment variable not set"
    );
  });

  it("throws when --team is not provided", () => {
    process.env.LINEAR_API_KEY = "lin_api_key";
    expect(() => createLinearSource({ team: "" })).toThrow(
      "--team is required"
    );
  });

  it("returns a source with name and idPrefix", () => {
    process.env.LINEAR_API_KEY = "lin_api_key";
    const source = createLinearSource({ team: "ENG" });
    expect(source.name).toBe("Linear");
    expect(source.idPrefix).toBe("linear-");
  });
});

describe("fetchIssues", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LINEAR_API_KEY = "lin_api_key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("calls Linear GraphQL API with correct URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    await source.fetchIssues();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.any(Object)
    );
  });

  it("sends Authorization header with API key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    await source.fetchIssues();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "lin_api_key",
        }),
      })
    );
  });

  it("sends POST request with GraphQL query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    await source.fetchIssues();
    const opts = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.query).toContain("issues(filter:");
    expect(body.variables.filter).toEqual(
      expect.objectContaining({
        team: { key: { eq: "ENG" } },
      })
    );
  });

  it("includes project filter when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG", project: "My Project" });
    await source.fetchIssues();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.variables.filter.project).toEqual({ name: { eq: "My Project" } });
  });

  it("uses custom filter JSON when provided", async () => {
    const customFilter = '{"assignee":{"id":{"eq":"user-1"}}}';
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG", filter: customFilter });
    await source.fetchIssues();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.variables.filter).toEqual({ assignee: { id: { eq: "user-1" } } });
  });

  it("throws on non-OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Server error", { status: 500 })
    );
    const source = createLinearSource({ team: "ENG" });
    await expect(source.fetchIssues()).rejects.toThrow(
      "Linear API returned HTTP 500"
    );
  });

  it("throws on GraphQL errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [{ message: "Team not found" }, { message: "Invalid filter" }],
        }),
        { status: 200 }
      )
    );
    const source = createLinearSource({ team: "ENG" });
    await expect(source.fetchIssues()).rejects.toThrow(
      "Linear API errors: Team not found, Invalid filter"
    );
  });

  it("returns empty array when no nodes in response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("returns empty array when nodes is undefined", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    expect(issues).toEqual([]);
  });

  it("maps issues correctly with all fields", async () => {
    const linearResponse = {
      data: {
        issues: {
          nodes: [
            {
              identifier: "ENG-42",
              title: "Fix login bug",
              description: "Users cannot log in",
              priority: 2,
              labels: { nodes: [{ name: "Frontend" }, { name: "Bug Fix" }] },
            },
          ],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(linearResponse), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      id: "linear-ENG-42",
      title: "Fix login bug",
      priority: 1,
      tags: ["frontend", "bug-fix"],
      description: "Users cannot log in",
    });
  });

  it("maps multiple issues from response", async () => {
    const linearResponse = {
      data: {
        issues: {
          nodes: [
            { identifier: "ENG-1", title: "First", priority: 1, labels: { nodes: [] } },
            { identifier: "ENG-2", title: "Second", priority: 2, labels: { nodes: [] } },
            { identifier: "ENG-3", title: "Third", priority: 3, labels: { nodes: [] } },
          ],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(linearResponse), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.id)).toEqual(["linear-ENG-1", "linear-ENG-2", "linear-ENG-3"]);
  });

  it("sets description to undefined when field is empty", async () => {
    const linearResponse = {
      data: {
        issues: {
          nodes: [
            { identifier: "ENG-1", title: "No desc", priority: 3, labels: { nodes: [] } },
          ],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(linearResponse), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    expect(issues[0].description).toBeUndefined();
  });

  it("respects custom maxResults", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG", maxResults: 50 });
    await source.fetchIssues();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.variables.first).toBe(50);
  });

  it("defaults maxResults to 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    await source.fetchIssues();
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.variables.first).toBe(200);
  });
});

describe("priority mapping", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LINEAR_API_KEY = "lin_api_key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function getPriority(linearPriority: number) {
    const linearResponse = {
      data: {
        issues: {
          nodes: [
            { identifier: "ENG-1", title: "Test", priority: linearPriority, labels: { nodes: [] } },
          ],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(linearResponse), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    return issues[0].priority;
  }

  it("maps Linear priority 1 (Urgent) to P0", async () => {
    expect(await getPriority(1)).toBe(0);
  });

  it("maps Linear priority 2 (High) to P1", async () => {
    expect(await getPriority(2)).toBe(1);
  });

  it("maps Linear priority 3 (Medium) to P2", async () => {
    expect(await getPriority(3)).toBe(2);
  });

  it("maps Linear priority 4 (Low) to P3", async () => {
    expect(await getPriority(4)).toBe(3);
  });

  it("maps Linear priority 0 (No priority) to P3", async () => {
    expect(await getPriority(0)).toBe(3);
  });

  it("defaults to P2 for unknown priority values", async () => {
    expect(await getPriority(99)).toBe(2);
  });
});

describe("tag extraction", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LINEAR_API_KEY = "lin_api_key";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function getTags(labels: string[]) {
    const linearResponse = {
      data: {
        issues: {
          nodes: [
            {
              identifier: "ENG-1",
              title: "Test",
              priority: 3,
              labels: { nodes: labels.map((name) => ({ name })) },
            },
          ],
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(linearResponse), { status: 200 })
    );
    const source = createLinearSource({ team: "ENG" });
    const issues = await source.fetchIssues();
    return issues[0].tags;
  }

  it("lowercases label names", async () => {
    const tags = await getTags(["Frontend", "API"]);
    expect(tags).toEqual(["frontend", "api"]);
  });

  it("replaces spaces with hyphens in label names", async () => {
    const tags = await getTags(["Bug Fix", "Code Review"]);
    expect(tags).toEqual(["bug-fix", "code-review"]);
  });

  it("returns empty array when no labels", async () => {
    const tags = await getTags([]);
    expect(tags).toEqual([]);
  });
});
