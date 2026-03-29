import { z } from "zod";

import type { PullRequestReviewWorkflowInput } from "./pr-review-workflow";

export const LIST_OUTPUT_SCHEMA = z.object({
  items: z.array(z.string().min(1)).min(1).max(10)
});

const DEFAULT_RETRY_BACKOFF_MS = 250;
const DEFAULT_RETRY_MAX_BACKOFF_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class ModelCallTimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModelCallTimeoutError";
  }
}

export interface RetryPolicy {
  maxBackoffMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  timeoutMs: number;
}

export function buildSummaryPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are reviewing a software pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return a concise summary in 2-3 sentences."
  ].join("\n");
}

export function buildRisksPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are reviewing pull request risk areas.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` as a list of 3-5 concrete risk areas."
  ].join("\n");
}

export function buildSuggestedTestsPrompt(
  input: PullRequestReviewWorkflowInput
): string {
  return [
    "You are generating software test suggestions for a pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` as 3-6 practical regression tests."
  ].join("\n");
}

export function buildFollowUpPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are proposing follow-up software engineering tasks.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` for 2-4 follow-up tasks."
  ].join("\n");
}

export async function invokeWithRetries<T>(
  operation: () => Promise<T>,
  policy: number | Partial<RetryPolicy>
): Promise<T> {
  const retryPolicy = normalizeRetryPolicy(policy);
  let attempt = 0;

  while (true) {
    try {
      return await invokeWithTimeout(
        operation,
        retryPolicy.timeoutMs,
        `Model call timed out after ${retryPolicy.timeoutMs}ms`
      );
    } catch (error) {
      if (!isRetryableError(error) || attempt >= retryPolicy.maxRetries) {
        throw error;
      }

      const backoffMs = Math.min(
        retryPolicy.retryBackoffMs * 2 ** attempt,
        retryPolicy.maxBackoffMs
      );
      attempt += 1;
      await delay(backoffMs);
    }
  }
}

export function normalizeConfidence(score: number): number {
  if (score < 0) {
    return 0;
  }

  if (score > 1) {
    return 1;
  }

  return Math.round(score * 100) / 100;
}

function normalizeRetryPolicy(
  policy: number | Partial<RetryPolicy>
): RetryPolicy {
  if (typeof policy === "number") {
    return {
      maxBackoffMs: DEFAULT_RETRY_MAX_BACKOFF_MS,
      maxRetries: policy,
      retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS
    };
  }

  return {
    maxBackoffMs: policy.maxBackoffMs ?? DEFAULT_RETRY_MAX_BACKOFF_MS,
    maxRetries: policy.maxRetries ?? 1,
    retryBackoffMs: policy.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
    timeoutMs: policy.timeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ModelCallTimeoutError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const retryableError = error as Error & {
    code?: string;
    retryable?: boolean;
    status?: number;
  };

  if (retryableError.retryable === true) {
    return true;
  }

  const status = retryableError.status;

  if (
    typeof status === "number" &&
    [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
  ) {
    return true;
  }

  const code = retryableError.code?.toUpperCase();

  if (
    code &&
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED"].includes(
      code
    )
  ) {
    return true;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("rate limit") ||
    message.includes("network")
  );
}

async function invokeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ModelCallTimeoutError(timeoutMessage));
    }, timeoutMs);

    operation()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
