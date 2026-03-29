import {
  GitHubTokenCommentPublisher,
  GitHubTokenPullRequestReader
} from "@patchloom/integrations-github";

export type GitHubPullRequestReader = Pick<
  GitHubTokenPullRequestReader,
  "fetchPullRequest" | "fetchPullRequestByUrl"
>;
export type GitHubCommentPublisher = Pick<
  GitHubTokenCommentPublisher,
  "publishPullRequestComment"
>;

export interface CreateGitHubPullRequestReaderOptions {
  githubApiUrl?: string;
  githubToken?: string;
  githubWebhookSecret?: string;
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

/**
 * Creates an optional GitHub comment publisher when token auth is configured.
 *
 * @param options - GitHub integration options.
 * @returns Token-backed comment publisher or null when token is unavailable.
 */
export function createGitHubCommentPublisher(
  options: CreateGitHubPullRequestReaderOptions
): GitHubCommentPublisher | null {
  if (!options.githubToken) {
    return null;
  }

  return new GitHubTokenCommentPublisher({
    apiBaseUrl: options.githubApiUrl,
    token: options.githubToken
  });
}
