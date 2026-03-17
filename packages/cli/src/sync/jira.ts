import type { SyncIssue, SyncSource } from "./types.js";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    priority?: { name: string };
    labels?: string[];
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
}

const PRIORITY_MAP: Record<string, number> = {
  highest: 0,
  blocker: 0,
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 3,
};

function mapPriority(priorityName: string): number {
  return PRIORITY_MAP[priorityName.toLowerCase()] ?? 2;
}

export interface JiraOptions {
  project?: string;
  jql?: string;
  maxResults?: number;
}

export function createJiraSource(options: JiraOptions): SyncSource {
  const jiraUrl = process.env.JIRA_URL;
  const jiraToken = process.env.JIRA_TOKEN;
  const authType = process.env.JIRA_AUTH ?? "basic";

  if (!jiraUrl) {
    throw new Error("JIRA_URL environment variable not set");
  }
  if (!jiraToken) {
    throw new Error("JIRA_TOKEN environment variable not set");
  }
  if (!options.project && !options.jql) {
    throw new Error("--project or --jql is required");
  }

  const jql =
    options.jql ??
    `project = ${options.project} AND resolution = Unresolved ORDER BY priority ASC, updated DESC`;
  const maxResults = options.maxResults ?? 200;

  return {
    name: "Jira",
    idPrefix: "jira-",

    async fetchIssues(): Promise<SyncIssue[]> {
      const params = new URLSearchParams({
        jql,
        maxResults: String(maxResults),
        fields: "summary,priority,labels,issuetype,status,key",
      });

      const authHeader =
        authType === "basic"
          ? `Basic ${jiraToken}`
          : `Bearer ${jiraToken}`;

      const response = await fetch(`${jiraUrl}/rest/api/2/search?${params}`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Jira API returned HTTP ${response.status}: ${body}`);
      }

      const data = (await response.json()) as JiraSearchResponse;
      if (!data.issues?.length) return [];

      return data.issues.map((issue) => ({
        id: `jira-${issue.key}`,
        title: issue.fields.summary,
        priority: mapPriority(issue.fields.priority?.name ?? "Medium"),
        tags: (issue.fields.labels ?? []).map((l) => l.toLowerCase()),
      }));
    },
  };
}
