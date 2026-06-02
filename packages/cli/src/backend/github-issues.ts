import { execFileSync } from "node:child_process";
import {
  type BackendTask,
  type BackendCapabilities,
  type ClaimTaskOptions,
  type ClaimTaskResult,
  type CreateTaskInput,
  type TaskBackend,
  sortByPriority,
} from "./types.js";

// Labels that map onto a priority bucket. We write `priority/P0`..`priority/P3`
// but also read the looser vocabulary that teams already use on their issues.
const PRIORITY_FROM_LABEL: Record<string, string> = {
  "priority/p0": "P0",
  "priority/p1": "P1",
  "priority/p2": "P2",
  "priority/p3": "P3",
  critical: "P0",
  p0: "P0",
  high: "P1",
  p1: "P1",
  medium: "P2",
  p2: "P2",
  low: "P3",
  p3: "P3",
};

interface GhLabel {
  name: string;
}
interface GhAssignee {
  login: string;
}
interface GhIssue {
  number: number;
  title: string;
  body?: string;
  url?: string;
  labels: GhLabel[];
  assignees: GhAssignee[];
}

export interface GitHubIssuesConfig {
  /** owner/repo; when omitted, gh uses the repo of the current directory. */
  repo?: string;
  /** Label that marks an issue as a tasks.md task. Default "tasks.md". */
  label: string;
}

function priorityFromLabels(labels: GhLabel[]): string {
  let best: string | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const label of labels) {
    const mapped = PRIORITY_FROM_LABEL[label.name.toLowerCase()];
    if (!mapped) continue;
    const rank = Number(mapped[1]);
    if (rank < bestRank) {
      best = mapped;
      bestRank = rank;
    }
  }
  return best ?? "P2";
}

function tagsFromLabels(labels: GhLabel[], filterLabel: string): string[] {
  const skip = filterLabel.toLowerCase();
  return labels
    .map((l) => l.name)
    .filter((name) => {
      const lower = name.toLowerCase();
      return lower !== skip && !(lower in PRIORITY_FROM_LABEL);
    });
}

/**
 * GitHub Issues backend. Reads/writes via the `gh` CLI so it inherits the
 * user's existing auth. Issues are matched by a marker label (default
 * "tasks.md"); priority comes from `priority/P*` labels; a claim is an
 * assignee; completion closes the issue (a merged PR with `Closes #N` does
 * the same automatically).
 */
export function createGitHubIssuesBackend(
  config: GitHubIssuesConfig,
): TaskBackend {
  const repoArgs = config.repo ? ["--repo", config.repo] : [];
  const capabilities: BackendCapabilities = {
    claims: "external",
    sourceOfTruth: "github-issues",
    generatedSnapshot: false,
  };

  function gh(args: string[]): string {
    return execFileSync("gh", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
  }

  function assertAuth(): void {
    try {
      execFileSync("gh", ["auth", "status"], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10_000,
      });
    } catch {
      throw new Error(
        "gh CLI is not authenticated. Run `gh auth login` (the github-issues backend needs it).",
      );
    }
  }

  function toTask(issue: GhIssue): BackendTask {
    return {
      id: String(issue.number),
      title: issue.title,
      priority: priorityFromLabels(issue.labels),
      tags: tagsFromLabels(issue.labels, config.label),
      assignee: issue.assignees[0]?.login,
      body: issue.body || undefined,
      url: issue.url,
    };
  }

  return {
    name: "GitHub Issues",
    capabilities,

    async listOpen(): Promise<BackendTask[]> {
      assertAuth();
      let out: string;
      try {
        out = gh([
          "issue",
          "list",
          ...repoArgs,
          "--label",
          config.label,
          "--state",
          "open",
          "--limit",
          "200",
          "--json",
          "number,title,body,labels,assignees,url",
        ]);
      } catch {
        return [];
      }
      if (!out || out === "[]") return [];
      const issues: GhIssue[] = JSON.parse(out);
      return sortByPriority(issues.map(toTask));
    },

    async next(): Promise<BackendTask | null> {
      const open = await this.listOpen();
      return open.find((task) => !task.assignee) ?? null;
    },

    async create(input: CreateTaskInput): Promise<BackendTask> {
      assertAuth();
      const priority = (input.priority ?? "P2").toUpperCase();
      const labels = [config.label, `priority/${priority}`, ...(input.tags ?? [])];
      const args = [
        "issue",
        "create",
        ...repoArgs,
        "--title",
        input.title,
        "--body",
        input.body ?? "",
      ];
      for (const label of labels) args.push("--label", label);
      // `gh issue create` prints the new issue URL on success.
      const url = gh(args).split("\n").pop()?.trim() ?? "";
      const number = url.split("/").pop() ?? "";
      return {
        id: number,
        title: input.title,
        priority,
        tags: input.tags ?? [],
        body: input.body,
        url: url || undefined,
      };
    },

    async claim(id: string, options?: ClaimTaskOptions): Promise<ClaimTaskResult> {
      assertAuth();
      gh(["issue", "edit", id, ...repoArgs, "--add-assignee", "@me"]);
      return {
        status: "claimed",
        backend: "GitHub Issues",
        taskId: id,
        owner: options?.actorId ?? "@me",
        capabilities,
      };
    },

    async complete(id: string): Promise<void> {
      assertAuth();
      gh(["issue", "close", id, ...repoArgs]);
    },
  };
}
