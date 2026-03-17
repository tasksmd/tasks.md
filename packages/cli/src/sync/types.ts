export interface SyncIssue {
  id: string;
  title: string;
  priority: number;
  tags: string[];
}

export interface SyncOptions {
  output?: string;
  merge?: boolean;
}

export interface SyncSource {
  name: string;
  idPrefix: string;
  fetchIssues(): Promise<SyncIssue[]>;
}
