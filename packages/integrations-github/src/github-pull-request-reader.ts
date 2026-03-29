export interface ParsedPullRequestUrl {
  owner: string;
  pullRequestNumber: number;
  repository: string;
}

export interface GitHubPullRequestDetails {
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

interface GitHubPullRequestApiResponse {
  number?: number;
  title?: string;
}

type FetchLike = typeof fetch;

export interface GitHubTokenPullRequestReaderOptions {
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
  token: string;
}

/**
 * Parses a GitHub pull request URL into owner, repository, and pull request number.
 *
 * @param pullRequestUrl - GitHub pull request URL.
 * @returns Parsed pull request URL parts.
 */
export function parseGitHubPullRequestUrl(
  pullRequestUrl: string
): ParsedPullRequestUrl {
  const parsedUrl = new URL(pullRequestUrl);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);

  if (segments.length < 4 || segments[2] !== "pull") {
    throw new Error("Invalid GitHub pull request URL format");
  }

  const pullRequestNumber = Number.parseInt(segments[3], 10);

  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error("Invalid pull request number in URL");
  }

  return {
    owner: segments[0],
    pullRequestNumber,
    repository: segments[1]
  };
}

/**
 * Reads pull request details from GitHub using a token-based REST call.
 */
export class GitHubTokenPullRequestReader {
  private readonly apiBaseUrl: string;

  private readonly fetchImpl: FetchLike;

  private readonly token: string;

  /**
   * Creates a token-backed GitHub pull request reader.
   *
   * @param options - Reader options and token.
   */
  public constructor(options: GitHubTokenPullRequestReaderOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token;
  }

  /**
   * Fetches pull request details from GitHub for the given pull request URL.
   *
   * @param pullRequestUrl - GitHub pull request URL.
   * @returns Pull request details for workflow run creation.
   */
  public async fetchPullRequestByUrl(
    pullRequestUrl: string
  ): Promise<GitHubPullRequestDetails> {
    const parsed = parseGitHubPullRequestUrl(pullRequestUrl);
    const endpoint = `${this.apiBaseUrl}/repos/${parsed.owner}/${parsed.repository}/pulls/${parsed.pullRequestNumber}`;

    const response = await this.fetchImpl(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      method: "GET"
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `GitHub pull request read failed: ${response.status} ${responseBody}`
      );
    }

    const payload = (await response.json()) as GitHubPullRequestApiResponse;

    if (!payload.title || !payload.number) {
      throw new Error("GitHub pull request response missing required fields");
    }

    return {
      pullRequestNumber: payload.number,
      pullRequestTitle: payload.title,
      repository: `${parsed.owner}/${parsed.repository}`
    };
  }
}
