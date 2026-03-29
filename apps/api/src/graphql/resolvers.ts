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
      publishComment: async (
        _: unknown,
        args: { input: PublishCommentInput },
        context: GraphQLContext
      ): Promise<CommentPublication> =>
        (context.reviewGovernanceStore ?? reviewGovernanceStore).publishComment(
          context.runStore ?? runStore,
          args.input
        ),
      startPullRequestReview: async (
        _: unknown,
        args: { input: StartPullRequestReviewInput },
        context: GraphQLContext
      ): Promise<WorkflowRun> => {
        const reader = context.githubPullRequestReader ?? githubPullRequestReader;

        if (!reader) {
          throw new Error(
            "GitHub token integration is not configured. Set GITHUB_TOKEN."
          );
        }

        const parsedRepository = parseRepositoryInput(args.input.repository);

        if (!parsedRepository) {
          throw new Error(
            "Repository must be owner/repo or a GitHub pull request URL."
          );
        }

        const details = await reader.fetchPullRequest(
          parsedRepository.owner,
          parsedRepository.repository,
          parsedRepository.pullRequestNumber ?? args.input.pullRequestNumber
        );

        return (context.runStore ?? runStore).startPullRequestReview(details);
      },
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

        return (context.runStore ?? runStore).startPullRequestReview(details);
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

function parseRepositoryInput(
  value: string
): { owner: string; repository: string; pullRequestNumber?: number } | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const slashSegments = trimmed.split("/");

  if (slashSegments.length === 2) {
    const [owner, repository] = slashSegments.map((part) => part.trim());

    if (!owner || !repository) {
      return null;
    }

    return {
      owner,
      repository
    };
  }

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (segments.length < 2 || segments[0] === "" || segments[1] === "") {
      return null;
    }

    const details: {
      owner: string;
      pullRequestNumber?: number;
      repository: string;
    } = {
      owner: segments[0],
      repository: segments[1]
    };

    if (segments.length >= 4 && segments[2] === "pull") {
      const pullRequestNumber = Number.parseInt(segments[3], 10);

      if (Number.isInteger(pullRequestNumber) && pullRequestNumber > 0) {
        details.pullRequestNumber = pullRequestNumber;
      }
    }

    return details;
  } catch {
    return null;
  }
}
