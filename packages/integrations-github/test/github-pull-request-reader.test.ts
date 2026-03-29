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
      expect(String(input)).toBe(
        "https://api.github.com/repos/acme/payments/pulls/281"
      );
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token"
      );

      return new Response(
        JSON.stringify({
          number: 281,
          title: "Improve refresh token handling"
        }),
        { status: 200 }
      );
    };

    const reader = new GitHubTokenPullRequestReader({
      fetchImpl,
      token: "test-token"
    });

    const details = await reader.fetchPullRequestByUrl(
      "https://github.com/acme/payments/pull/281"
    );

    expect(details).toEqual({
      pullRequestNumber: 281,
      pullRequestTitle: "Improve refresh token handling",
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
