import { randomUUID } from "node:crypto";

import {
  canTransitionRunStatus,
  type RunStatus,
  type StartPullRequestReviewInput,
  type Suggestion,
  type WorkflowRun
} from "@patchloom/core";
import { PubSub } from "graphql-subscriptions";

const RUN_UPDATED_EVENT = "runUpdated";

export interface RunStoreOptions {
  autoProgress?: boolean;
  lifecycleDelayMs?: number;
}

export interface RunUpdatedEvent {
  runUpdated: WorkflowRun;
}

interface RunEventMap {
  [eventName: string]: unknown;
  runUpdated: RunUpdatedEvent;
}

/**
 * In-memory workflow run store used for development and tests.
 */
export class InMemoryRunStore {
  private readonly autoProgress: boolean;

  private readonly lifecycleDelayMs: number;

  private readonly pubSub = new PubSub<RunEventMap>();

  private readonly runs = new Map<string, WorkflowRun>();

  private readonly scheduledTimers = new Set<NodeJS.Timeout>();

  /**
   * Creates a run store instance.
   *
   * @param options - Runtime options for lifecycle behavior.
   */
  public constructor(options: RunStoreOptions = {}) {
    this.autoProgress = options.autoProgress ?? true;
    this.lifecycleDelayMs = options.lifecycleDelayMs ?? 100;
  }

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
      status: "queued",
      suggestions,
      summary,
      updatedAt: now,
      workflowType: "pr_summary"
    };

    this.runs.set(run.id, run);
    this.publishRunUpdated(run);

    if (this.autoProgress) {
      this.scheduleAutoProgress(run.id);
    }

    return run;
  }

  /**
   * Transitions a run to the next status if allowed.
   *
   * @param runId - Workflow run identifier.
   * @param nextStatus - Target status.
   * @returns Updated workflow run.
   */
  public transitionRunStatus(runId: string, nextStatus: RunStatus): WorkflowRun {
    const existingRun = this.runs.get(runId);

    if (!existingRun) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (!canTransitionRunStatus(existingRun.status, nextStatus)) {
      throw new Error(
        `Invalid transition from ${existingRun.status} to ${nextStatus}`
      );
    }

    const updatedRun: WorkflowRun = {
      ...existingRun,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    this.runs.set(runId, updatedRun);
    this.publishRunUpdated(updatedRun);

    return updatedRun;
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
   * Creates a subscription iterator for run updates.
   *
   * @returns Async iterator emitting `runUpdated` payloads.
   */
  public subscribeRunUpdates(): AsyncIterableIterator<RunUpdatedEvent> {
    return this.pubSub.asyncIterableIterator<RunUpdatedEvent>(RUN_UPDATED_EVENT);
  }

  /**
   * Clears scheduled timers used by lifecycle simulation.
   */
  public dispose(): void {
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }

    this.scheduledTimers.clear();
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

  /**
   * Publishes run update events for subscribers.
   *
   * @param run - Updated run payload.
   */
  private publishRunUpdated(run: WorkflowRun): void {
    this.pubSub.publish(RUN_UPDATED_EVENT, {
      runUpdated: run
    });
  }

  /**
   * Schedules deterministic status progression for mock workflow runs.
   *
   * @param runId - Workflow run identifier.
   */
  private scheduleAutoProgress(runId: string): void {
    const statuses: RunStatus[] = ["running", "waiting_for_approval", "completed"];

    statuses.forEach((nextStatus, index) => {
      const timer = setTimeout(() => {
        this.scheduledTimers.delete(timer);

        try {
          this.transitionRunStatus(runId, nextStatus);
        } catch {
          // Ignore failures for disposed or missing runs in development mode.
        }
      }, this.lifecycleDelayMs * (index + 1));

      this.scheduledTimers.add(timer);
    });
  }
}
