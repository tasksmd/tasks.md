import { execSync } from "node:child_process";
import type { SyncIssue, SyncSource } from "./types.js";

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  labels: GitHubLabel[];
}

const PRIORITY_LABELS: Record<string, number> = {
  critical: 0,
  p0: 0,
  high: 1,
  p1: 1,
  medium: 2,
  p2: 2,
  low: 3,
  p3: 3,
};

function mapPriority(labels: GitHubLabel[], filterLabel: string): number {
  let priority = 2; // default P2
  for (const label of labels) {
    const name = label.name.toLowerCase();
    if (name === filterLabel.toLowerCase()) continue;
    const mapped = PRIORITY_LABELS[name];
    if (mapped !== undefined && mapped < priority) {
      priority = mapped;
    }
  }
  return priority;
}

function mapTags(labels: GitHubLabel[], filterLabel: string): string[] {
  return labels
    .map((l) => l.name.toLowerCase())
    .filter((name) => name !== filterLabel.toLowerCase() && !(name in PRIORITY_LABELS));
}

export interface GitHubOptions {
  repo?: string;
  label?: string;
}

export function createGitHubSource(options: GitHubOptions = {}): SyncSource {
  const label = options.label ?? "tasks.md";

  return {
    name: "GitHub Issues",
    idPrefix: "issue-",

    async fetchIssues(): Promise<SyncIssue[]> {
      // Validate gh CLI
      try {
        execSync("gh auth status", { stdio: ["pipe", "pipe", "pipe"] });
      } catch {
        throw new Error("gh CLI not authenticated. Run 'gh auth login'");
      }

      const repoFlag = options.repo ? `--repo ${options.repo}` : "";
      let output: string;
      try {
        output = execSync(
          `gh issue list ${repoFlag} --label "${label}" --state open --limit 200 --json number,title,body,labels`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim();
      } catch {
        return [];
      }

      if (!output || output === "[]") return [];

      const issues: GitHubIssue[] = JSON.parse(output);
      return issues.map((issue) => ({
        id: `issue-${issue.number}`,
        title: issue.title,
        priority: mapPriority(issue.labels, label),
        tags: mapTags(issue.labels, label),
        description: issue.body || undefined,
      }));
    },
  };
}
