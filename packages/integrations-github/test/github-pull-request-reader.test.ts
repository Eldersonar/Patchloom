import { describe, expect, it } from "vitest";

import {
  GitHubTokenPullRequestReader,
  parseGitHubPullRequestUrl
} from "../src/github-pull-request-reader";

describe("parseGitHubPullRequestUrl", () => {
  it("parses standard pull request URLs", () => {
    const parsed = parseGitHubPullRequestUrl(
      "https://github.com/acme/payments/pull/281"
    );

    expect(parsed).toEqual({
      owner: "acme",
      pullRequestNumber: 281,
      repository: "payments"
    });
  });

  it("throws for invalid URL formats", () => {
    expect(() =>
      parseGitHubPullRequestUrl("https://github.com/acme/payments/issues/42")
    ).toThrowError(/Invalid GitHub pull request URL format/);
  });

  it("throws for invalid pull request numbers", () => {
    expect(() =>
      parseGitHubPullRequestUrl("https://github.com/acme/payments/pull/not-a-number")
    ).toThrowError(/Invalid pull request number/);
  });
});

describe("GitHubTokenPullRequestReader", () => {
  it("fetches pull request details using token auth", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const requestedUrl = String(input);
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token"
      );

      if (requestedUrl === "https://api.github.com/repos/acme/payments/pulls/281") {
        return new Response(
          JSON.stringify({
            body: "Improve refresh token handling and cache invalidation.",
            number: 281,
            title: "Improve refresh token handling"
          }),
          { status: 200 }
        );
      }

      if (
        requestedUrl ===
        "https://api.github.com/repos/acme/payments/pulls/281/files?per_page=30"
      ) {
        return new Response(
          JSON.stringify([
            {
              additions: 12,
              deletions: 5,
              filename: "src/auth/session.ts",
              patch: "@@ -17,7 +17,9 @@ if (expired) refreshToken(user)",
              status: "modified"
            }
          ]),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected request URL: ${requestedUrl}`);
    };

    const reader = new GitHubTokenPullRequestReader({
      fetchImpl,
      token: "test-token"
    });

    const details = await reader.fetchPullRequestByUrl(
      "https://github.com/acme/payments/pull/281"
    );

    expect(details).toEqual({
      changedFiles: [
        "src/auth/session.ts (modified, +12/-5): @@ -17,7 +17,9 @@ if (expired) refreshToken(user)"
      ],
      pullRequestBody: "Improve refresh token handling and cache invalidation.",
      pullRequestNumber: 281,
      pullRequestTitle: "Improve refresh token handling",
      repository: "acme/payments"
    });
  });

  it("supports repository + number lookup", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const requestedUrl = String(input);

      if (requestedUrl === "https://api.github.com/repos/acme/payments/pulls/99") {
        return new Response(
          JSON.stringify({
            body: "",
            number: 99,
            title: "Fix flaky retry scheduling"
          }),
          { status: 200 }
        );
      }

      if (
        requestedUrl ===
        "https://api.github.com/repos/acme/payments/pulls/99/files?per_page=30"
      ) {
        return new Response(
          JSON.stringify([
            {
              additions: 3,
              deletions: 1,
              filename: "src/retry.ts",
              status: "modified"
            }
          ]),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({ message: `Unexpected ${requestedUrl}` }),
        { status: 500 }
      );
    };

    const reader = new GitHubTokenPullRequestReader({
      fetchImpl,
      token: "test-token"
    });

    const details = await reader.fetchPullRequest("acme", "payments", 99);

    expect(details).toEqual({
      changedFiles: ["src/retry.ts (modified, +3/-1)"],
      pullRequestBody: "",
      pullRequestNumber: 99,
      pullRequestTitle: "Fix flaky retry scheduling",
      repository: "acme/payments"
    });
  });

  it("throws descriptive errors for GitHub API failures", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });

    const reader = new GitHubTokenPullRequestReader({
      fetchImpl,
      token: "test-token"
    });

    await expect(
      reader.fetchPullRequestByUrl("https://github.com/acme/payments/pull/999")
    ).rejects.toThrowError(/GitHub pull request read failed/);
  });
});
