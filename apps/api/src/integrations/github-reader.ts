import { GitHubTokenPullRequestReader } from "@patchloom/integrations-github";

export type GitHubPullRequestReader = Pick<
  GitHubTokenPullRequestReader,
  "fetchPullRequestByUrl"
>;

export interface CreateGitHubPullRequestReaderOptions {
  githubApiUrl?: string;
  githubToken?: string;
}

/**
 * Creates an optional GitHub PR reader when token auth is configured.
 *
 * @param options - GitHub integration options.
 * @returns Token-backed PR reader or null when token is unavailable.
 */
export function createGitHubPullRequestReader(
  options: CreateGitHubPullRequestReaderOptions
): GitHubPullRequestReader | null {
  if (!options.githubToken) {
    return null;
  }

  return new GitHubTokenPullRequestReader({
    apiBaseUrl: options.githubApiUrl,
    token: options.githubToken
  });
}
