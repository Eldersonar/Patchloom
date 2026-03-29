import { randomUUID } from "node:crypto";

import type {
  StartPullRequestReviewInput,
  Suggestion,
  WorkflowRun
} from "@patchloom/core";

/**
 * In-memory workflow run store used for development and tests.
 */
export class InMemoryRunStore {
  private readonly runs = new Map<string, WorkflowRun>();

  /**
   * Starts a mock pull request review run and stores the result.
   *
   * @param input - Pull request review input payload.
   * @returns Newly created workflow run.
   */
  public startPullRequestReview(input: StartPullRequestReviewInput): WorkflowRun {
    const now = new Date().toISOString();
    const summary = `PR #${input.pullRequestNumber}: ${input.pullRequestTitle}`;
    const suggestions = this.createMockSuggestions(input.pullRequestTitle, now);

    const run: WorkflowRun = {
      createdAt: now,
      id: randomUUID(),
      pullRequestNumber: input.pullRequestNumber,
      repository: input.repository,
      status: "completed",
      suggestions,
      summary,
      updatedAt: now,
      workflowType: "pr_summary"
    };

    this.runs.set(run.id, run);

    return run;
  }

  /**
   * Fetches a workflow run by id.
   *
   * @param runId - Workflow run identifier.
   * @returns Workflow run or null if missing.
   */
  public getRun(runId: string): WorkflowRun | null {
    return this.runs.get(runId) ?? null;
  }

  /**
   * Lists all runs ordered by creation time descending.
   *
   * @returns Workflow run list.
   */
  public listRuns(): WorkflowRun[] {
    return [...this.runs.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  /**
   * Creates deterministic mock suggestions for the scaffold workflow.
   *
   * @param pullRequestTitle - Pull request title.
   * @param createdAt - Creation timestamp for generated suggestions.
   * @returns Generated suggestions array.
   */
  private createMockSuggestions(
    pullRequestTitle: string,
    createdAt: string
  ): Suggestion[] {
    return [
      {
        content: `Review edge cases related to: ${pullRequestTitle}`,
        createdAt,
        id: randomUUID(),
        kind: "risk"
      },
      {
        content: "Add regression tests for changed modules.",
        createdAt,
        id: randomUUID(),
        kind: "test"
      }
    ];
  }
}
