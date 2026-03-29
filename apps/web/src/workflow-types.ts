export interface WorkflowRunView {
  confidence: number;
  createdAt: string;
  failureReason: string | null;
  followUpTasks: string[];
  id: string;
  pullRequestNumber: number;
  repository: string;
  risks: string[];
  status: string;
  suggestedTests: string[];
  suggestions: SuggestionView[];
  summary: string;
  workflowType: string;
}

export interface StartRunInput {
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

export interface SuggestionView {
  content: string;
  id: string;
  kind: string;
}

export interface ApprovalDecisionView {
  actor: string;
  createdAt: string;
  decision: string;
  id: string;
  runId: string;
  suggestionId: string;
}

export interface CommentPublicationView {
  body: string;
  commentId: string;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  publishedUrl: string;
  runId: string;
  target: string;
}
