import type {
  StartPullRequestReviewInput,
  WorkflowRun
} from "@patchloom/core";
import { withFilter } from "graphql-subscriptions";

import type { GitHubPullRequestReader } from "../integrations/github-reader";
import type { InMemoryRunStore, RunUpdatedEvent } from "../workflow/run-store";
import {
  type ApprovalDecision,
  type ApproveSuggestionInput,
  type CommentPublication,
  type InMemoryReviewGovernanceStore,
  type PublishCommentInput
} from "../workflow/review-governance-store";

export interface GraphQLContext {
  githubPullRequestReader: GitHubPullRequestReader | null;
  requestId: string;
  reviewGovernanceStore: InMemoryReviewGovernanceStore;
  runStore: InMemoryRunStore;
}

export interface ResolverDependencies {
  appVersion: string;
  githubPullRequestReader: GitHubPullRequestReader | null;
  reviewGovernanceStore: InMemoryReviewGovernanceStore;
  runStore: InMemoryRunStore;
}

/**
 * Creates GraphQL resolver map bound to runtime dependencies.
 *
 * @param dependencies - Resolver dependencies.
 * @returns Resolver map object.
 */
export function createResolvers(dependencies: ResolverDependencies) {
  const {
    appVersion,
    githubPullRequestReader,
    reviewGovernanceStore,
    runStore
  } = dependencies;

  return {
    Mutation: {
      approveSuggestion: (
        _: unknown,
        args: { input: ApproveSuggestionInput },
        context: GraphQLContext
      ): ApprovalDecision =>
        (context.reviewGovernanceStore ?? reviewGovernanceStore).approveSuggestion(
          context.runStore ?? runStore,
          args.input
        ),
      publishComment: (
        _: unknown,
        args: { input: PublishCommentInput },
        context: GraphQLContext
      ): CommentPublication =>
        (context.reviewGovernanceStore ?? reviewGovernanceStore).publishComment(
          context.runStore ?? runStore,
          args.input
        ),
      startPullRequestReview: (
        _: unknown,
        args: { input: StartPullRequestReviewInput },
        context: GraphQLContext
      ): WorkflowRun => (context.runStore ?? runStore).startPullRequestReview(args.input),
      startPullRequestReviewFromUrl: async (
        _: unknown,
        args: { input: { pullRequestUrl: string } },
        context: GraphQLContext
      ): Promise<WorkflowRun> => {
        const reader = context.githubPullRequestReader ?? githubPullRequestReader;

        if (!reader) {
          throw new Error(
            "GitHub token integration is not configured. Set GITHUB_TOKEN."
          );
        }

        const details = await reader.fetchPullRequestByUrl(args.input.pullRequestUrl);

        return (context.runStore ?? runStore).startPullRequestReview({
          pullRequestNumber: details.pullRequestNumber,
          pullRequestTitle: details.pullRequestTitle,
          repository: details.repository
        });
      }
    },
    Query: {
      getRun: (
        _: unknown,
        args: { id: string },
        context: GraphQLContext
      ): WorkflowRun | null => (context.runStore ?? runStore).getRun(args.id),
      health: (): { status: string; version: string } => ({
        status: "ok",
        version: appVersion
      }),
      listApprovalDecisions: (
        _: unknown,
        args: { runId: string },
        context: GraphQLContext
      ): ApprovalDecision[] =>
        (context.reviewGovernanceStore ?? reviewGovernanceStore).listApprovalDecisions(
          args.runId
        ),
      listCommentPublications: (
        _: unknown,
        args: { runId: string },
        context: GraphQLContext
      ): CommentPublication[] =>
        (context.reviewGovernanceStore ?? reviewGovernanceStore).listCommentPublications(
          args.runId
        ),
      listRuns: (_: unknown, __: unknown, context: GraphQLContext): WorkflowRun[] =>
        (context.runStore ?? runStore).listRuns()
    },
    Subscription: {
      runUpdated: {
        resolve: (payload: RunUpdatedEvent): WorkflowRun => payload.runUpdated,
        subscribe: withFilter(
          (_: unknown, __: unknown, context?: GraphQLContext) =>
            (context?.runStore ?? runStore).subscribeRunUpdates(),
          (payload: unknown, args: unknown) => {
            if (
              typeof payload !== "object" ||
              payload === null ||
              !("runUpdated" in payload) ||
              typeof args !== "object" ||
              args === null ||
              !("runId" in args)
            ) {
              return false;
            }

            return (
              (payload as RunUpdatedEvent).runUpdated.id ===
              String((args as { runId: unknown }).runId)
            );
          }
        )
      }
    }
  };
}
