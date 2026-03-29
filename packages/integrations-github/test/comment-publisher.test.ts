import { describe, expect, it } from "vitest";

import { GitHubTokenCommentPublisher } from "../src/comment-publisher";

describe("GitHubTokenCommentPublisher", () => {
  it("publishes pull request comments using GitHub issues comments API", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(
        "https://api.github.com/repos/acme/payments/issues/281/comments"
      );
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        body: "Approved summary"
      });

      return new Response(
        JSON.stringify({
          html_url: "https://github.com/acme/payments/pull/281#issuecomment-1",
          id: 1
        }),
        { status: 201 }
      );
    };

    const publisher = new GitHubTokenCommentPublisher({
      fetchImpl,
      token: "test-token"
    });
    const result = await publisher.publishPullRequestComment({
      body: "Approved summary",
      pullRequestUrl: "https://github.com/acme/payments/pull/281"
    });

    expect(result).toEqual({
      commentId: "1",
      publishedUrl: "https://github.com/acme/payments/pull/281#issuecomment-1"
    });
  });

  it("throws descriptive errors for GitHub API failures", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });

    const publisher = new GitHubTokenCommentPublisher({
      fetchImpl,
      token: "test-token"
    });

    await expect(
      publisher.publishPullRequestComment({
        body: "Approved summary",
        pullRequestUrl: "https://github.com/acme/payments/pull/281"
      })
    ).rejects.toThrowError(/GitHub comment publish failed/);
  });
});
