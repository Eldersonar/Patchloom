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

export interface GitHubIssueWebhookPayload {
  action?: string;
  issue?: {
    body?: string;
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

export interface GitHubIssueWebhookDetails {
  issueBody: string;
  issueNumber: number;
  issueTitle: string;
  repository: string;
}

export type NormalizedGitHubWebhookEvent =
  | {
      details: GitHubPullRequestWebhookDetails;
      kind: "pull_request";
    }
  | {
      details: GitHubIssueWebhookDetails;
      kind: "issue";
    };

const SUPPORTED_PULL_REQUEST_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize"
]);
const SUPPORTED_ISSUE_ACTIONS = new Set(["opened", "reopened"]);

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

/**
 * Extracts issue details from GitHub webhook payload when event/action is supported.
 *
 * @param eventName - GitHub event name (`X-GitHub-Event`).
 * @param payload - Parsed issue webhook payload.
 * @returns Issue details or null when event/action should be ignored.
 */
export function extractIssueWebhookDetails(
  eventName: string | null | undefined,
  payload: GitHubIssueWebhookPayload
): GitHubIssueWebhookDetails | null {
  if (eventName !== "issues") {
    return null;
  }

  if (!payload.action || !SUPPORTED_ISSUE_ACTIONS.has(payload.action)) {
    return null;
  }

  const number = payload.issue?.number;
  const title = payload.issue?.title?.trim();
  const repository = payload.repository?.full_name?.trim();

  if (!number || !title || !repository) {
    return null;
  }

  return {
    issueBody: payload.issue?.body ?? "",
    issueNumber: number,
    issueTitle: title,
    repository
  };
}

/**
 * Normalizes supported GitHub webhook payloads into an internal event shape.
 *
 * @param eventName - GitHub event name (`X-GitHub-Event`).
 * @param payload - Parsed webhook payload.
 * @returns Normalized event or null when payload should be ignored.
 */
export function normalizeGitHubWebhookEvent(
  eventName: string | null | undefined,
  payload: GitHubPullRequestWebhookPayload | GitHubIssueWebhookPayload
): NormalizedGitHubWebhookEvent | null {
  const pullRequestDetails = extractPullRequestWebhookDetails(
    eventName,
    payload as GitHubPullRequestWebhookPayload
  );

  if (pullRequestDetails) {
    return {
      details: pullRequestDetails,
      kind: "pull_request"
    };
  }

  const issueDetails = extractIssueWebhookDetails(
    eventName,
    payload as GitHubIssueWebhookPayload
  );

  if (!issueDetails) {
    return null;
  }

  return {
    details: issueDetails,
    kind: "issue"
  };
}
