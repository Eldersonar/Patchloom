import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";
import { InMemoryReviewGovernanceStore } from "../../src/workflow/review-governance-store";

describe("workflow run flow", () => {
  it("creates and fetches pull request review runs", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const reviewGovernanceStore = new InMemoryReviewGovernanceStore();
    const githubPullRequestReader = {
      async fetchPullRequest() {
        return {
          changedFiles: ["src/auth.ts (modified, +8/-2)"],
          pullRequestBody: "Improve auth refresh flow behavior for edge cases.",
          pullRequestNumber: 21,
          pullRequestTitle: "Improve auth refresh flow",
          repository: "acme/service-api"
        };
      },
      async fetchPullRequestByUrl() {
        throw new Error("Not implemented for this test");
      }
    };
    const server = createGraphQLServer(
      "0.1.0-test",
      runStore,
      undefined,
      undefined,
      githubPullRequestReader
    );
    await server.start();

    const mutationResult = await server.executeOperation(
      {
        query: `
          mutation Start($input: StartPullRequestReviewInput!) {
            startPullRequestReview(input: $input) {
              id
              repository
              pullRequestNumber
              status
              failureReason
              summary
              confidence
              promptVersion
              workflowVersion
              suggestions {
                kind
              }
            }
          }
        `,
        variables: {
          input: {
            pullRequestNumber: 21,
            pullRequestTitle: "Improve auth refresh flow",
            repository: "acme/service-api"
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    if (mutationResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    const createdRun = mutationResult.body.singleResult.data
      ?.startPullRequestReview as {
      id: string;
      pullRequestNumber: number;
      repository: string;
      status: string;
      failureReason: string | null;
      confidence: number;
      promptVersion: string;
      workflowVersion: string;
      suggestions: Array<{ kind: string }>;
      summary: string;
    };

    expect(createdRun.repository).toBe("acme/service-api");
    expect(createdRun.pullRequestNumber).toBe(21);
    expect(createdRun.status).toBe("queued");
    expect(createdRun.failureReason).toBeNull();
    expect(createdRun.confidence).toBe(0);
    expect(createdRun.promptVersion).toBe("pr-review-prompts/v1");
    expect(createdRun.workflowVersion).toBe("pr-review-workflow/v1");
    expect(createdRun.summary).toContain("Improve auth refresh flow");
    expect(createdRun.suggestions).toEqual([]);

    const getRunResult = await server.executeOperation(
      {
        query: `
          query GetRun($id: ID!) {
            getRun(id: $id) {
              id
              summary
              status
            }
          }
        `,
        variables: {
          id: createdRun.id
        }
      },
      {
        contextValue: {
          githubPullRequestReader,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    if (getRunResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    const fetchedRun = getRunResult.body.singleResult.data?.getRun as
      | { id: string; status: string }
      | undefined;

    expect(fetchedRun?.id).toBe(createdRun.id);
    expect(fetchedRun?.status).toBe("queued");

    const listRunsResult = await server.executeOperation(
      {
        query: "query { listRuns { id } }"
      },
      {
        contextValue: {
          githubPullRequestReader,
          requestId: "test-request",
          reviewGovernanceStore,
          runStore
        }
      }
    );

    await server.stop();
    runStore.dispose();

    if (listRunsResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    const listedRuns = listRunsResult.body.singleResult.data?.listRuns as
      | Array<{ id: string }>
      | undefined;

    expect(listedRuns?.length).toBe(1);
  });

  it("rejects direct startPullRequestReview when GitHub integration is not configured", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const reviewGovernanceStore = new InMemoryReviewGovernanceStore();
    const server = createGraphQLServer("0.1.0-test", runStore);
    await server.start();

    const mutationResult = await server.executeOperation(
      {
        query: `
          mutation Start($input: StartPullRequestReviewInput!) {
            startPullRequestReview(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            pullRequestNumber: 1,
            pullRequestTitle: "Test",
            repository: "acme/service-api"
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

    if (mutationResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(mutationResult.body.singleResult.errors?.[0]?.message).toContain(
      "GitHub token integration is not configured"
    );
  });
});
