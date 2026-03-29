import { createHmac, timingSafeEqual } from "node:crypto";

export interface GitHubPullRequestWebhookPayload {
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
  };
  repository?: {
    full_name?: string;
  };
}

export interface GitHubPullRequestWebhookDetails {
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

const SUPPORTED_PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize"
]);

/**
 * Verifies GitHub webhook signatures using `X-Hub-Signature-256`.
 *
 * @param rawBody - Raw webhook request body bytes.
 * @param signatureHeader - Signature header value from GitHub.
 * @param secret - Webhook secret configured in GitHub.
 * @returns True when signature is valid.
 */
export function verifyGitHubWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedDigest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const providedDigest = signatureHeader.slice("sha256=".length);

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(providedDigest, "hex"),
    Buffer.from(expectedDigest, "hex")
  );
}

/**
 * Extracts pull request details from GitHub webhook payload when event/action is supported.
 *
 * @param eventName - GitHub event name (`X-GitHub-Event`).
 * @param payload - Parsed webhook payload.
 * @returns Pull request details or null when event/action should be ignored.
 */
export function extractPullRequestWebhookDetails(
  eventName: string | null | undefined,
  payload: GitHubPullRequestWebhookPayload
): GitHubPullRequestWebhookDetails | null {
  if (eventName !== "pull_request") {
    return null;
  }

  if (!payload.action || !SUPPORTED_PULL_REQUEST_ACTIONS.has(payload.action)) {
    return null;
  }

  const number = payload.pull_request?.number;
  const title = payload.pull_request?.title?.trim();
  const repository = payload.repository?.full_name?.trim();

  if (!number || !title || !repository) {
    return null;
  }

  return {
    pullRequestNumber: number,
    pullRequestTitle: title,
    repository
  };
}
