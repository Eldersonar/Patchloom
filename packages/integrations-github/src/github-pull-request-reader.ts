export interface ParsedPullRequestUrl {
  owner: string;
  pullRequestNumber: number;
  repository: string;
}

export interface GitHubPullRequestDetails {
  changedFiles: string[];
  pullRequestBody: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

interface GitHubPullRequestApiResponse {
  body?: string | null;
  number?: number;
  title?: string;
}

interface GitHubPullRequestFileApiResponse {
  additions?: number;
  deletions?: number;
  filename?: string;
  patch?: string;
  status?: string;
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
    return this.fetchPullRequest(
      parsed.owner,
      parsed.repository,
      parsed.pullRequestNumber
    );
  }

  /**
   * Fetches pull request details from GitHub for the given repository reference.
   *
   * @param owner - Repository owner.
   * @param repository - Repository name.
   * @param pullRequestNumber - Pull request number.
   * @returns Pull request details for workflow run creation.
   */
  public async fetchPullRequest(
    owner: string,
    repository: string,
    pullRequestNumber: number
  ): Promise<GitHubPullRequestDetails> {
    const endpoint = `${this.apiBaseUrl}/repos/${owner}/${repository}/pulls/${pullRequestNumber}`;
    const filesEndpoint = `${endpoint}/files?per_page=30`;
    const [payload, filesPayload] = await Promise.all([
      this.fetchJson<GitHubPullRequestApiResponse>(endpoint),
      this.fetchJson<GitHubPullRequestFileApiResponse[]>(filesEndpoint)
    ]);

    if (!payload.title || !payload.number) {
      throw new Error("GitHub pull request response missing required fields");
    }

    const changedFiles = filesPayload
      .map((file) => this.formatChangedFile(file))
      .filter((file): file is string => typeof file === "string");

    return {
      changedFiles,
      pullRequestBody: payload.body ?? "",
      pullRequestNumber: payload.number,
      pullRequestTitle: payload.title,
      repository: `${owner}/${repository}`
    };
  }

  private async fetchJson<TPayload>(endpoint: string): Promise<TPayload> {
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

    return (await response.json()) as TPayload;
  }

  private formatChangedFile(
    file: GitHubPullRequestFileApiResponse
  ): string | null {
    if (!file.filename) {
      return null;
    }

    const status = file.status ?? "modified";
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    const patchSnippet = this.normalizePatchSnippet(file.patch);

    if (!patchSnippet) {
      return `${file.filename} (${status}, +${additions}/-${deletions})`;
    }

    return `${file.filename} (${status}, +${additions}/-${deletions}): ${patchSnippet}`;
  }

  private normalizePatchSnippet(patch: string | undefined): string | null {
    if (!patch) {
      return null;
    }

    const compact = patch.replace(/\s+/g, " ").trim();

    if (!compact) {
      return null;
    }

    return compact.length > 200 ? `${compact.slice(0, 197)}...` : compact;
  }
}
