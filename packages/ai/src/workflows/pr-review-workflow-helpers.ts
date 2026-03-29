import { z } from "zod";

import type { PullRequestReviewWorkflowInput } from "./pr-review-workflow";

export const LIST_OUTPUT_SCHEMA = z
  .object({
    items: z.array(z.unknown()).min(1).max(10)
  })
  .transform((payload, context) => {
    const normalizedItems: string[] = [];

    payload.items.forEach((item, index) => {
      const normalized = normalizeListItem(item);

      if (!normalized) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Unable to normalize item into string. Provide plain string items.",
          path: ["items", index]
        });
        return;
      }

      normalizedItems.push(normalized);
    });

    if (normalizedItems.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No valid list items were returned after normalization.",
        path: ["items"]
      });
    }

    return {
      items: normalizedItems
    };
  });

export function buildSummaryPrompt(input: PullRequestReviewWorkflowInput): string {
  return [
    "You are reviewing a software pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    buildAdditionalContext(input),
    "Return a concise summary in 2-3 sentences.",
    "Rules: use only provided context, avoid speculation, mention changed areas explicitly."
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
    "Return JSON with key `items` as a list of 2-4 concrete risk areas.",
    "Rules: plain string items only, each item <= 180 chars, avoid generic security boilerplate.",
    "Each risk must be traceable to provided files/description."
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
    "Return JSON with key `items` as 3-5 practical regression tests.",
    "Rules: plain string items only, each item <= 180 chars, focus on changed behavior."
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
    "Return JSON with key `items` for 2-3 follow-up tasks.",
    "Rules: plain string items only, each item <= 180 chars, no duplicate ideas from risks/tests."
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

/**
 * Normalizes unknown model list items into concise strings.
 *
 * @param item - Unknown model item payload.
 * @returns Normalized string item or null when it cannot be normalized.
 */
function normalizeListItem(item: unknown): string | null {
  const direct = normalizePrimitiveToString(item);

  if (direct) {
    return direct;
  }

  if (Array.isArray(item)) {
    const parts = item
      .map((entry) => normalizeListItem(entry))
      .filter((entry): entry is string => Boolean(entry));

    if (parts.length > 0) {
      return parts.join("; ");
    }

    return null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const objectItem = item as Record<string, unknown>;
  const title = normalizePrimitiveToString(objectItem.title);
  const description = normalizePrimitiveToString(objectItem.description);

  if (title && description) {
    return `${title}: ${description}`;
  }

  const preferredKeyOrder = [
    "text",
    "content",
    "summary",
    "title",
    "description",
    "risk",
    "test",
    "task",
    "name",
    "label",
    "reason"
  ];

  for (const key of preferredKeyOrder) {
    const normalized = normalizePrimitiveToString(objectItem[key]);

    if (normalized) {
      return normalized;
    }
  }

  for (const value of Object.values(objectItem)) {
    const nested = normalizeListItem(value);

    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * Converts primitive values into normalized strings.
 *
 * @param value - Unknown primitive value.
 * @returns Trimmed string or null when conversion is not possible.
 */
function normalizePrimitiveToString(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}
