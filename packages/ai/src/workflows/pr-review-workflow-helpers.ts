import { z } from "zod";

import type { PullRequestReviewWorkflowInput } from "./pr-review-workflow";

export const LIST_OUTPUT_SCHEMA = z.object({
  items: z.array(z.string().min(1)).min(1).max(10)
});

export function buildSummaryPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are reviewing a software pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    buildAdditionalContext(input),
    "Return a concise summary in 2-3 sentences."
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export function buildRisksPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are reviewing pull request risk areas.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    buildAdditionalContext(input),
    "Return JSON with key `items` as a list of 3-5 concrete risk areas."
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export function buildSuggestedTestsPrompt(
  input: PullRequestReviewWorkflowInput
): string {
  return [
    "You are generating software test suggestions for a pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    buildAdditionalContext(input),
    "Return JSON with key `items` as 3-6 practical regression tests."
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export function buildFollowUpPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are proposing follow-up software engineering tasks.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    buildAdditionalContext(input),
    "Return JSON with key `items` for 2-4 follow-up tasks."
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function buildAdditionalContext(input: PullRequestReviewWorkflowInput): string {
  const sections: string[] = [];

  if (input.pullRequestBody?.trim()) {
    sections.push(`Pull request description:\n${input.pullRequestBody.trim()}`);
  }

  const changedFiles = input.changedFiles?.filter((file) => file.trim().length > 0) ?? [];

  if (changedFiles.length > 0) {
    sections.push(`Changed files:\n- ${changedFiles.join("\n- ")}`);
  }

  return sections.join("\n\n");
}

export async function invokeWithRetries<T>(
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
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
