export const runStatuses = [
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled"
] as const;

export type RunStatus = (typeof runStatuses)[number];

export const allowedRunTransitions: Record<RunStatus, RunStatus[]> = {
  cancelled: [],
  completed: [],
  failed: [],
  queued: ["running", "cancelled", "failed"],
  running: ["waiting_for_approval", "completed", "failed", "cancelled"],
  waiting_for_approval: ["completed", "failed", "cancelled", "running"]
};

export interface Suggestion {
  content: string;
  createdAt: string;
  id: string;
  kind: "risk" | "summary" | "test" | "follow_up";
  sourceRefs: SuggestionSourceRef[];
}

export interface SuggestionSourceRef {
  lineHint?: number;
  path: string;
}

export interface WorkflowRun {
  confidence: number;
  createdAt: string;
  failureReason?: string | null;
  followUpTasks: string[];
  id: string;
  promptVersion: string;
  pullRequestNumber: number;
  repository: string;
  risks: string[];
  artifacts: {
    normalizedOutput: {
      confidence: number;
      followUpTasks: string[];
      risks: string[];
      suggestedTests: string[];
      summary: string;
    };
    rawModelResponses: {
      followUpTasks: string;
      risks: string;
      suggestedTests: string;
      summary: string;
    };
  };
  status: RunStatus;
  suggestedTests: string[];
  suggestions: Suggestion[];
  summary: string;
  updatedAt: string;
  workflowVersion: string;
  workflowType: "pr_summary";
}

export interface StartPullRequestReviewInput {
  changedFiles?: string[];
  pullRequestBody?: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

/**
 * Checks whether a run status transition is valid.
 *
 * @param currentStatus - Current run status.
 * @param nextStatus - Target run status.
 * @returns True when transition is allowed.
 */
export function canTransitionRunStatus(
  currentStatus: RunStatus,
  nextStatus: RunStatus
): boolean {
  return allowedRunTransitions[currentStatus].includes(nextStatus);
}
