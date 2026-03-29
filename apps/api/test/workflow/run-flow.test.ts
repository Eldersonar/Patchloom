import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("workflow run flow", () => {
  it("creates and fetches pull request review runs", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const server = createGraphQLServer("0.1.0-test", runStore);
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
          githubPullRequestReader: null,
          requestId: "test-request",
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
      confidence: number;
      promptVersion: string;
      workflowVersion: string;
      suggestions: Array<{ kind: string }>;
      summary: string;
    };

    expect(createdRun.repository).toBe("acme/service-api");
    expect(createdRun.pullRequestNumber).toBe(21);
    expect(createdRun.status).toBe("queued");
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
          githubPullRequestReader: null,
          requestId: "test-request",
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
          githubPullRequestReader: null,
          requestId: "test-request",
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
});
