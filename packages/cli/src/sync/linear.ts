import type { SyncIssue, SyncSource } from "./types.js";

interface LinearIssue {
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  labels: { nodes: Array<{ name: string }> };
}

interface LinearResponse {
  data?: {
    issues?: {
      nodes?: LinearIssue[];
    };
  };
  errors?: Array<{ message: string }>;
}

const PRIORITY_MAP: Record<number, number> = {
  1: 0, // Urgent → P0
  2: 1, // High → P1
  3: 2, // Medium → P2
  4: 3, // Low → P3
  0: 3, // No priority → P3
};

function mapPriority(linearPriority: number): number {
  return PRIORITY_MAP[linearPriority] ?? 2;
}

export interface LinearOptions {
  team: string;
  project?: string;
  filter?: string;
  maxResults?: number;
}

export function createLinearSource(options: LinearOptions): SyncSource {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable not set");
  }
  if (!options.team) {
    throw new Error("--team is required");
  }

  const maxResults = options.maxResults ?? 200;

  return {
    name: "Linear",
    idPrefix: "linear-",

    async fetchIssues(): Promise<SyncIssue[]> {
      const filterObj: Record<string, unknown> = options.filter
        ? JSON.parse(options.filter)
        : {
            team: { key: { eq: options.team } },
            state: { type: { nin: ["completed", "canceled"] } },
            ...(options.project
              ? { project: { name: { eq: options.project } } }
              : {}),
          };

      const query = `query($filter: IssueFilter!, $first: Int!) {
  issues(filter: $filter, first: $first, orderBy: updatedAt) {
    nodes {
      identifier
      title
      description
      priority
      labels { nodes { name } }
    }
  }
}`;

      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { filter: filterObj, first: maxResults },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Linear API returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as LinearResponse;

      if (data.errors?.length) {
        throw new Error(
          `Linear API errors: ${data.errors.map((e) => e.message).join(", ")}`
        );
      }

      const nodes = data.data?.issues?.nodes ?? [];
      if (nodes.length === 0) return [];

      return nodes.map((issue) => ({
        id: `linear-${issue.identifier}`,
        title: issue.title,
        priority: mapPriority(issue.priority),
        tags: issue.labels.nodes
          .map((l) => l.name.toLowerCase().replace(/\s+/g, "-"))
          .filter(Boolean),
        description: issue.description || undefined,
      }));
    },
  };
}
