export const runStatuses = [
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled"
] as const;

export type RunStatus = (typeof runStatuses)[number];

export interface Suggestion {
  content: string;
  createdAt: string;
  id: string;
  kind: "risk" | "summary" | "test" | "follow_up";
}

export interface WorkflowRun {
  createdAt: string;
  id: string;
  pullRequestNumber: number;
  repository: string;
  status: RunStatus;
  suggestions: Suggestion[];
  summary: string;
  updatedAt: string;
  workflowType: "pr_summary";
}

export interface StartPullRequestReviewInput {
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}
