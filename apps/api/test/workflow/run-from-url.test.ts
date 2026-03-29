import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../../src/server";
import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("workflow run from URL", () => {
  it("starts a run from GitHub pull request URL", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const githubPullRequestReader = {
      async fetchPullRequestByUrl() {
        return {
          pullRequestNumber: 281,
          pullRequestTitle: "Improve token refresh edge-case handling",
          repository: "acme/payments"
        };
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

    const result = await server.executeOperation(
      {
        query: `
          mutation StartFromUrl($input: StartPullRequestReviewFromUrlInput!) {
            startPullRequestReviewFromUrl(input: $input) {
              repository
              pullRequestNumber
              summary
            }
          }
        `,
        variables: {
          input: {
            pullRequestUrl: "https://github.com/acme/payments/pull/281"
          }
        }
      },
      {
        contextValue: {
          githubPullRequestReader,
          requestId: "test-request",
          runStore
        }
      }
    );

    await server.stop();
    runStore.dispose();

    if (result.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(result.body.singleResult.errors).toBeUndefined();
    expect(result.body.singleResult.data?.startPullRequestReviewFromUrl).toEqual({
      pullRequestNumber: 281,
      repository: "acme/payments",
      summary: "PR #281: Improve token refresh edge-case handling"
    });
  });

  it("fails when GitHub token integration is not configured", async () => {
    const runStore = new InMemoryRunStore({ autoProgress: false });
    const server = createGraphQLServer("0.1.0-test", runStore);
    await server.start();

    const result = await server.executeOperation(
      {
        query: `
          mutation StartFromUrl($input: StartPullRequestReviewFromUrlInput!) {
            startPullRequestReviewFromUrl(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            pullRequestUrl: "https://github.com/acme/payments/pull/281"
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

    await server.stop();
    runStore.dispose();

    if (result.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(result.body.singleResult.errors?.[0]?.message).toContain(
      "GitHub token integration is not configured"
    );
  });
});
