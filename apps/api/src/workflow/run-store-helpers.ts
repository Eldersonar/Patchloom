import { randomUUID } from "node:crypto";

import type { Suggestion, WorkflowRun } from "@patchloom/core";

/**
 * Creates default empty workflow artifacts for a newly queued run.
 *
 * @returns Empty artifacts payload.
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
 * Builds suggestion records from normalized workflow output arrays.
 *
 * @param run - Workflow run with normalized outputs.
 * @param createdAt - Suggestion creation timestamp.
 * @returns Flattened suggestion list.
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
 * Converts unknown thrown values into error text for run failure records.
 *
 * @param error - Unknown thrown value.
 * @returns Best-effort readable message.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown workflow execution error";
}
