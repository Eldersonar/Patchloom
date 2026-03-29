import { describe, expect, it } from "vitest";

import { InMemoryRunStore } from "../../src/workflow/run-store";
import { InMemoryReviewGovernanceStore } from "../../src/workflow/review-governance-store";

describe("InMemoryReviewGovernanceStore", () => {
  it("stores approval decisions per suggestion", async () => {
    const runStore = createRunStoreWithDeterministicSuggestions();
    const governanceStore = new InMemoryReviewGovernanceStore({
      commentPublisher: createCommentPublisherStub()
    });
    const run = await createCompletedRun(runStore);
    const suggestionId = run.suggestions[0]?.id;

    if (!suggestionId) {
      throw new Error("Expected suggestion id");
    }

    const decision = governanceStore.approveSuggestion(runStore, {
      actor: "simon",
      decision: "approved",
      runId: run.id,
      suggestionId
    });

    expect(decision.actor).toBe("simon");
    expect(decision.decision).toBe("approved");
    expect(governanceStore.listApprovalDecisions(run.id)).toHaveLength(1);

    runStore.dispose();
  });

  it("blocks publishing until all suggestions are approved", async () => {
    const runStore = createRunStoreWithDeterministicSuggestions();
    const governanceStore = new InMemoryReviewGovernanceStore({
      commentPublisher: createCommentPublisherStub()
    });
    const run = await createCompletedRun(runStore);
    const firstSuggestionId = run.suggestions[0]?.id;

    if (!firstSuggestionId) {
      throw new Error("Expected suggestion id");
    }

    governanceStore.approveSuggestion(runStore, {
      actor: "simon",
      decision: "approved",
      runId: run.id,
      suggestionId: firstSuggestionId
    });

    await expect(
      governanceStore.publishComment(runStore, {
        body: "Summary comment",
        idempotencyKey: "publish-1",
        runId: run.id,
        target: "https://github.com/acme/payments/pull/302"
      })
    ).rejects.toThrowError(/Missing approvals/);

    runStore.dispose();
  });

  it("publishes to GitHub and remains idempotent for duplicate keys", async () => {
    const runStore = createRunStoreWithDeterministicSuggestions();
    const governanceStore = new InMemoryReviewGovernanceStore({
      commentPublisher: createCommentPublisherStub()
    });
    const run = await createCompletedRun(runStore);

    for (const suggestion of run.suggestions) {
      governanceStore.approveSuggestion(runStore, {
        actor: "simon",
        decision: "approved",
        runId: run.id,
        suggestionId: suggestion.id
      });
    }

    const firstPublication = await governanceStore.publishComment(runStore, {
      body: "Approved summary",
      idempotencyKey: "publish-2",
      runId: run.id,
      target: "https://github.com/acme/payments/pull/302"
    });
    const duplicatePublication = await governanceStore.publishComment(runStore, {
      body: "Approved summary",
      idempotencyKey: "publish-2",
      runId: run.id,
      target: "https://github.com/acme/payments/pull/302"
    });

    expect(duplicatePublication.id).toBe(firstPublication.id);
    expect(firstPublication.commentId).toBe("123");
    expect(firstPublication.publishedUrl).toContain("issuecomment-123");
    expect(governanceStore.listCommentPublications(run.id)).toHaveLength(1);

    runStore.dispose();
  });

  it("fails publishing when GitHub publisher is not configured", async () => {
    const runStore = createRunStoreWithDeterministicSuggestions();
    const governanceStore = new InMemoryReviewGovernanceStore();
    const run = await createCompletedRun(runStore);

    for (const suggestion of run.suggestions) {
      governanceStore.approveSuggestion(runStore, {
        actor: "simon",
        decision: "approved",
        runId: run.id,
        suggestionId: suggestion.id
      });
    }

    await expect(
      governanceStore.publishComment(runStore, {
        body: "Approved summary",
        idempotencyKey: "publish-3",
        runId: run.id,
        target: "https://github.com/acme/payments/pull/302"
      })
    ).rejects.toThrowError(/GitHub comment publisher is not configured/);

    runStore.dispose();
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

function createCommentPublisherStub() {
  return {
    async publishPullRequestComment() {
      return {
        commentId: "123",
        publishedUrl: "https://github.com/acme/payments/pull/302#issuecomment-123"
      };
    }
  };
}
