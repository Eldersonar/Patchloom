import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";
import { InMemoryReviewGovernanceStore } from "../../src/workflow/review-governance-store";

describe("review governance GraphQL", () => {
  it("approves suggestions and publishes with idempotency", async () => {
    const runStore = createRunStoreWithDeterministicSuggestions();
    const reviewGovernanceStore = new InMemoryReviewGovernanceStore();
    const server = createGraphQLServer(
      "0.1.0-test",
      runStore,
      undefined,
      undefined,
      null,
      reviewGovernanceStore
    );
    await server.start();

    const run = await createCompletedRun(runStore);
    const firstSuggestion = run.suggestions[0];

    if (!firstSuggestion) {
      throw new Error("Expected at least one suggestion");
    }

    const approvalResult = await server.executeOperation(
      {
        query: `
          mutation Approve($input: ApproveSuggestionInput!) {
            approveSuggestion(input: $input) {
              actor
              decision
              suggestionId
            }
          }
        `,
        variables: {
          input: {
            actor: "simon",
            decision: "approved",
            runId: run.id,
            suggestionId: firstSuggestion.id
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader: null,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    if (approvalResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(approvalResult.body.singleResult.errors).toBeUndefined();
    expect(approvalResult.body.singleResult.data?.approveSuggestion).toEqual({
      actor: "simon",
      decision: "approved",
      suggestionId: firstSuggestion.id
    });

    const publishErrorResult = await server.executeOperation(
      {
        query: `
          mutation Publish($input: PublishCommentInput!) {
            publishComment(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            body: "Approved summary",
            idempotencyKey: "pub-key-1",
            runId: run.id,
            target: "https://github.com/acme/payments/pull/302"
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader: null,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    if (publishErrorResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(publishErrorResult.body.singleResult.errors?.[0]?.message).toContain(
      "Missing approvals"
    );

    for (const suggestion of run.suggestions.slice(1)) {
      await server.executeOperation(
        {
          query: `
            mutation Approve($input: ApproveSuggestionInput!) {
              approveSuggestion(input: $input) {
                id
              }
            }
          `,
          variables: {
            input: {
              actor: "simon",
              decision: "approved",
              runId: run.id,
              suggestionId: suggestion.id
            }
          }
        },
        {
          contextValue: {
            githubPullRequestReader: null,
            requestId: "test-request",
            reviewGovernanceStore,
            runStore
          }
        }
      );
    }

    const publishResult = await server.executeOperation(
      {
        query: `
          mutation Publish($input: PublishCommentInput!) {
            publishComment(input: $input) {
              id
              idempotencyKey
            }
          }
        `,
        variables: {
          input: {
            body: "Approved summary",
            idempotencyKey: "pub-key-2",
            runId: run.id,
            target: "https://github.com/acme/payments/pull/302"
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader: null,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    const duplicatePublishResult = await server.executeOperation(
      {
        query: `
          mutation Publish($input: PublishCommentInput!) {
            publishComment(input: $input) {
              id
              idempotencyKey
            }
          }
        `,
        variables: {
          input: {
            body: "Approved summary",
            idempotencyKey: "pub-key-2",
            runId: run.id,
            target: "https://github.com/acme/payments/pull/302"
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader: null,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    await server.stop();
    runStore.dispose();

    if (
      publishResult.body.kind !== "single" ||
      duplicatePublishResult.body.kind !== "single"
    ) {
      throw new Error("Expected single response body");
    }

    const firstPublishData = publishResult.body.singleResult.data as
      | { publishComment: { id: string } }
      | undefined;
    const duplicatePublishData = duplicatePublishResult.body.singleResult.data as
      | { publishComment: { id: string } }
      | undefined;
    const firstPublishId = firstPublishData?.publishComment.id;
    const duplicatePublishId = duplicatePublishData?.publishComment.id;

    expect(firstPublishId).toBeDefined();
    expect(duplicatePublishId).toBe(firstPublishId);
  });
});

function createRunStoreWithDeterministicSuggestions(): InMemoryRunStore {
  return new InMemoryRunStore({
    autoProgress: true,
    lifecycleDelayMs: 5,
    workflowExecutor: async () => ({
      artifacts: {
        normalizedOutput: {
          confidence: 0.8,
          followUpTasks: ["Document retry behavior."],
          risks: ["Token refresh edge case."],
          suggestedTests: ["Add regression test for refresh token expiry."],
          summary: "PR updates auth refresh flow."
        },
        rawModelResponses: {
          followUpTasks: '{"items":["Document retry behavior."]}',
          risks: '{"items":["Token refresh edge case."]}',
          suggestedTests: '{"items":["Add regression test for refresh token expiry."]}',
          summary: "PR updates auth refresh flow."
        }
      },
      output: {
        confidence: 0.8,
        followUpTasks: ["Document retry behavior."],
        promptVersion: "pr-review-prompts/v1",
        risks: ["Token refresh edge case."],
        suggestedTests: ["Add regression test for refresh token expiry."],
        summary: "PR updates auth refresh flow.",
        workflowVersion: "pr-review-workflow/v1"
      }
    })
  });
}

async function createCompletedRun(runStore: InMemoryRunStore) {
  const run = runStore.startPullRequestReview({
    pullRequestNumber: 302,
    pullRequestTitle: "Improve auth refresh flow",
    repository: "acme/payments"
  });

  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = runStore.getRun(run.id);

    if (!current) {
      throw new Error("Run not found");
    }

    if (current.status === "completed") {
      return current;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error("Run did not complete in expected time");
}
