import { createClient, type Client } from "graphql-ws";

import type {
  ApprovalDecisionView,
  CommentPublicationView,
  StartRunInput,
  WorkflowRunView
} from "./workflow-types";

const defaultHttpUrl = "http://localhost:4000/graphql";
const defaultWsUrl = "ws://localhost:4000/graphql";

let wsClient: Client | null = null;

/**
 * Fetches all workflow runs for the dashboard list.
 *
 * @returns Workflow run list ordered by API response.
 */
export async function fetchRuns(): Promise<WorkflowRunView[]> {
  const result = await executeGraphQL<{ listRuns: WorkflowRunView[] }>(
    `query ListRuns {
      listRuns {
        id
        repository
        pullRequestNumber
        status
        workflowType
        createdAt
        failureReason
        summary
        confidence
        suggestions {
          id
          kind
          content
        }
        risks
        suggestedTests
        followUpTasks
      }
    }`
  );

  return result.listRuns;
}

/**
 * Starts a pull request review run.
 *
 * @param input - Pull request run input.
 * @returns Created run.
 */
export async function startPullRequestReview(
  input: StartRunInput
): Promise<WorkflowRunView> {
  const result = await executeGraphQL<{ startPullRequestReview: WorkflowRunView }>(
    `mutation StartRun($input: StartPullRequestReviewInput!) {
      startPullRequestReview(input: $input) {
        id
        repository
        pullRequestNumber
        status
        workflowType
        createdAt
        failureReason
        summary
        confidence
        suggestions {
          id
          kind
          content
        }
        risks
        suggestedTests
        followUpTasks
      }
    }`,
    { input }
  );

  return result.startPullRequestReview;
}

/**
 * Subscribes to live updates for a specific run.
 *
 * @param runId - Workflow run identifier.
 * @param onNext - Callback for run update payloads.
 * @param onError - Callback for subscription errors.
 * @returns Cleanup function for unsubscribing.
 */
export function subscribeRunUpdated(
  runId: string,
  onNext: (run: WorkflowRunView) => void,
  onError: (error: Error) => void
): () => void {
  const client = getWsClient();
  const unsubscribe = client.subscribe(
    {
      query: `subscription RunUpdated($runId: ID!) {
        runUpdated(runId: $runId) {
          id
          repository
          pullRequestNumber
          status
          workflowType
          createdAt
          failureReason
          summary
          confidence
          suggestions {
            id
            kind
            content
          }
          risks
          suggestedTests
          followUpTasks
        }
      }`,
      variables: { runId }
    },
    {
      complete: () => undefined,
      error: (eventError) => {
        if (eventError instanceof Error) {
          onError(eventError);
          return;
        }

        onError(new Error("Subscription failed"));
      },
      next: (payload) => {
        const run = (
          payload.data as { runUpdated?: WorkflowRunView } | null | undefined
        )?.runUpdated;

        if (run) {
          onNext(run);
        }
      }
    }
  );

  return () => unsubscribe();
}

/**
 * Lists approval decisions for a workflow run.
 *
 * @param runId - Workflow run identifier.
 * @returns Approval decisions for the run.
 */
export async function listApprovalDecisions(
  runId: string
): Promise<ApprovalDecisionView[]> {
  const result = await executeGraphQL<{
    listApprovalDecisions: ApprovalDecisionView[];
  }>(
    `query Decisions($runId: ID!) {
      listApprovalDecisions(runId: $runId) {
        id
        runId
        suggestionId
        actor
        decision
        createdAt
      }
    }`,
    { runId }
  );

  return result.listApprovalDecisions;
}

/**
 * Approves or rejects a suggestion.
 *
 * @param input - Suggestion decision payload.
 * @returns Stored approval decision.
 */
export async function approveSuggestion(input: {
  actor: string;
  decision: "approved" | "rejected";
  runId: string;
  suggestionId: string;
}): Promise<ApprovalDecisionView> {
  const result = await executeGraphQL<{ approveSuggestion: ApprovalDecisionView }>(
    `mutation Approve($input: ApproveSuggestionInput!) {
      approveSuggestion(input: $input) {
        id
        runId
        suggestionId
        actor
        decision
        createdAt
      }
    }`,
    { input }
  );

  return result.approveSuggestion;
}

/**
 * Lists published comments for a workflow run.
 *
 * @param runId - Workflow run identifier.
 * @returns Stored comment publications.
 */
export async function listCommentPublications(
  runId: string
): Promise<CommentPublicationView[]> {
  const result = await executeGraphQL<{
    listCommentPublications: CommentPublicationView[];
  }>(
    `query Publications($runId: ID!) {
      listCommentPublications(runId: $runId) {
        id
        runId
        target
        body
        idempotencyKey
        commentId
        publishedUrl
        createdAt
      }
    }`,
    { runId }
  );

  return result.listCommentPublications;
}

/**
 * Publishes an approved comment to GitHub.
 *
 * @param input - Publication payload.
 * @returns Stored publication result.
 */
export async function publishComment(input: {
  body: string;
  idempotencyKey: string;
  runId: string;
  target: string;
}): Promise<CommentPublicationView> {
  const result = await executeGraphQL<{ publishComment: CommentPublicationView }>(
    `mutation Publish($input: PublishCommentInput!) {
      publishComment(input: $input) {
        id
        runId
        target
        body
        idempotencyKey
        commentId
        publishedUrl
        createdAt
      }
    }`,
    { input }
  );

  return result.publishComment;
}

/**
 * Executes a GraphQL request over HTTP and returns typed data.
 *
 * @param query - GraphQL operation text.
 * @param variables - Optional operation variables.
 * @returns Typed response data.
 */
async function executeGraphQL<TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> {
  const response = await fetch(import.meta.env.VITE_GRAPHQL_HTTP_URL ?? defaultHttpUrl, {
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "GraphQL request failed");
  }

  if (!payload.data) {
    throw new Error("GraphQL response had no data");
  }

  return payload.data;
}

/**
 * Returns a lazily initialized GraphQL WebSocket client.
 *
 * @returns GraphQL WS client instance.
 */
function getWsClient(): Client {
  if (!wsClient) {
    wsClient = createClient({
      lazy: true,
      url: import.meta.env.VITE_GRAPHQL_WS_URL ?? defaultWsUrl
    });
  }

  return wsClient;
}
