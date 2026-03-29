export interface WorkflowRunView {
  confidence: number;
  createdAt: string;
  followUpTasks: string[];
  id: string;
  pullRequestNumber: number;
  repository: string;
  risks: string[];
  status: string;
  suggestedTests: string[];
  summary: string;
  workflowType: string;
}

export interface StartRunInput {
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}
