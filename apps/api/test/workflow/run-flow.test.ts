import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("workflow run flow", () => {
  it("creates and fetches pull request review runs", async () => {
    const runStore = new InMemoryRunStore();
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
      suggestions: Array<{ kind: string }>;
      summary: string;
    };

    expect(createdRun.repository).toBe("acme/service-api");
    expect(createdRun.pullRequestNumber).toBe(21);
    expect(createdRun.status).toBe("completed");
    expect(createdRun.summary).toContain("Improve auth refresh flow");
    expect(createdRun.suggestions.length).toBeGreaterThan(0);

    const getRunResult = await server.executeOperation(
      {
        query: `
          query GetRun($id: ID!) {
            getRun(id: $id) {
              id
              summary
            }
          }
        `,
        variables: {
          id: createdRun.id
        }
      },
      {
        contextValue: {
          requestId: "test-request",
          runStore
        }
      }
    );

    if (getRunResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    const fetchedRun = getRunResult.body.singleResult.data?.getRun as
      | { id: string }
      | undefined;

    expect(fetchedRun?.id).toBe(createdRun.id);

    const listRunsResult = await server.executeOperation(
      {
        query: "query { listRuns { id } }"
      },
      {
        contextValue: {
          requestId: "test-request",
          runStore
        }
      }
    );

    await server.stop();

    if (listRunsResult.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    const listedRuns = listRunsResult.body.singleResult.data?.listRuns as
      | Array<{ id: string }>
      | undefined;

    expect(listedRuns?.length).toBe(1);
  });
});
