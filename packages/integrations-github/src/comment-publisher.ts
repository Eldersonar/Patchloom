import { parseGitHubPullRequestUrl } from "./github-pull-request-reader";

type FetchLike = typeof fetch;

export interface PublishPullRequestCommentInput {
  body: string;
  pullRequestUrl: string;
}

export interface GitHubPublishedComment {
  commentId: string;
  publishedUrl: string;
}

interface GitHubCommentApiResponse {
  html_url?: string;
  id?: number;
}

export interface GitHubTokenCommentPublisherOptions {
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
  token: string;
}

/**
 * GitHub REST publisher for posting top-level comments to pull requests.
 */
export class GitHubTokenCommentPublisher {
  private readonly apiBaseUrl: string;

  private readonly fetchImpl: FetchLike;

  private readonly token: string;

  /**
   * Creates a token-backed comment publisher.
   *
   * @param options - Publisher options and credentials.
   */
  public constructor(options: GitHubTokenCommentPublisherOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token;
  }

  /**
   * Publishes a top-level comment to a GitHub pull request.
   *
   * @param input - Pull request URL and comment body.
   * @returns Published comment identifiers.
   */
  public async publishPullRequestComment(
    input: PublishPullRequestCommentInput
  ): Promise<GitHubPublishedComment> {
    const parsed = parseGitHubPullRequestUrl(input.pullRequestUrl);
    const endpoint = `${this.apiBaseUrl}/repos/${parsed.owner}/${parsed.repository}/issues/${parsed.pullRequestNumber}/comments`;

    const response = await this.fetchImpl(endpoint, {
      body: JSON.stringify({
        body: input.body
      }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      method: "POST"
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `GitHub comment publish failed: ${response.status} ${responseBody}`
      );
    }

    const payload = (await response.json()) as GitHubCommentApiResponse;

    if (!payload.id || !payload.html_url) {
      throw new Error("GitHub comment publish response missing required fields");
    }

    return {
      commentId: String(payload.id),
      publishedUrl: payload.html_url
    };
  }
}
