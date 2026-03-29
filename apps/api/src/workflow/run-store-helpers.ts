import { randomUUID } from "node:crypto";

import type { Suggestion, WorkflowRun } from "@patchloom/core";

/**
 * Creates empty artifact containers for a new workflow run.
 *
 * @returns Initial workflow artifacts.
 */
export function createInitialArtifacts(): WorkflowRun["artifacts"] {
  return {
    normalizedOutput: {
      confidence: 0,
      followUpTasks: [],
      risks: [],
      suggestedTests: [],
      summary: ""
    },
    rawModelResponses: {
      followUpTasks: "",
      risks: "",
      suggestedTests: "",
      summary: ""
    }
  };
}

/**
 * Builds suggestion entities from normalized workflow output fields.
 *
 * @param run - Workflow run with normalized output fields.
 * @param createdAt - Suggestion creation timestamp.
 * @returns Suggestion entities for risk/test/follow-up items.
 */
export function createSuggestionsFromWorkflowOutput(
  run: WorkflowRun,
  createdAt: string
): Suggestion[] {
  return [
    ...run.risks.map((risk) => ({
      content: risk,
      createdAt,
      id: randomUUID(),
      kind: "risk" as const
    })),
    ...run.suggestedTests.map((test) => ({
      content: test,
      createdAt,
      id: randomUUID(),
      kind: "test" as const
    })),
    ...run.followUpTasks.map((task) => ({
      content: task,
      createdAt,
      id: randomUUID(),
      kind: "follow_up" as const
    }))
  ];
}

/**
 * Converts unknown workflow errors into user-facing run failure messages.
 *
 * @param error - Unknown error value.
 * @returns User-facing failure reason.
 */
export function toFailureReason(error: unknown): string {
  if (isZodLikeError(error)) {
    return formatZodLikeError(error);
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "Workflow execution failed.";
}

/**
 * Emits a single-line structured log event for workflow execution.
 *
 * @param event - Event name.
 * @param payload - Event fields.
 */
export function logRunEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return;
  }

  console.log(
    JSON.stringify({
      event,
      scope: "workflow_run",
      timestamp: new Date().toISOString(),
      ...payload
    })
  );
}

/**
 * Serializes unknown errors for structured log output.
 *
 * @param error - Unknown error value.
 * @returns Serializable error payload.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return {
    value: String(error)
  };
}

interface ZodLikeIssue {
  message?: unknown;
  path?: unknown;
}

interface ZodLikeErrorShape {
  issues?: unknown;
  name?: unknown;
}

/**
 * Detects zod-style validation errors by shape.
 *
 * @param error - Unknown error value.
 * @returns True when error matches zod-like structure.
 */
function isZodLikeError(error: unknown): error is ZodLikeErrorShape {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ZodLikeErrorShape;

  return (
    candidate.name === "ZodError" && Array.isArray(candidate.issues)
  );
}

/**
 * Formats zod-style validation errors into concise user-facing messages.
 *
 * @param error - Zod-like error shape.
 * @returns Concise validation failure reason.
 */
function formatZodLikeError(error: ZodLikeErrorShape): string {
  const issues = (error.issues as ZodLikeIssue[]).filter(
    (issue) => issue && typeof issue === "object"
  );

  if (issues.length === 0) {
    return "Model output validation failed.";
  }

  const firstIssue = issues[0];
  const firstMessage = asNonEmptyString(firstIssue.message) ?? "Invalid output.";
  const firstPath = formatIssuePath(firstIssue.path);
  const suffix = issues.length > 1 ? ` (+${issues.length - 1} more issues)` : "";

  if (!firstPath) {
    return `Model output validation failed: ${firstMessage}${suffix}`;
  }

  return `Model output validation failed at ${firstPath}: ${firstMessage}${suffix}`;
}

/**
 * Formats zod issue paths into dot notation.
 *
 * @param path - Unknown issue path value.
 * @returns Dot-notation path or null when unavailable.
 */
function formatIssuePath(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  return path
    .map((segment) => String(segment))
    .filter((segment) => segment.length > 0)
    .join(".");
}

/**
 * Returns trimmed non-empty string values.
 *
 * @param value - Unknown value.
 * @returns Trimmed string or null when not available.
 */
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
