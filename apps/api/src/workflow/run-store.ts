import { randomUUID } from "node:crypto";

import {
  canTransitionRunStatus,
  type RunStatus,
  type StartPullRequestReviewInput,
  type WorkflowRun
} from "@patchloom/core";
import { PubSub } from "graphql-subscriptions";

import {
  createDefaultWorkflowExecutor,
  type PullRequestReviewWorkflowExecutor
} from "./default-workflow-executor";
import {
  createInitialArtifacts,
  createSuggestionsFromWorkflowOutput,
  logRunEvent,
  serializeError,
  toFailureReason
} from "./run-store-helpers";

const RUN_UPDATED_EVENT = "runUpdated";

export interface RunStoreOptions {
  autoProgress?: boolean;
  lifecycleDelayMs?: number;
  workflowExecutor?: PullRequestReviewWorkflowExecutor;
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

  private readonly workflowExecutor: PullRequestReviewWorkflowExecutor;

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
    this.workflowExecutor =
      options.workflowExecutor ?? createDefaultWorkflowExecutor();
  }

  /**
   * Starts a pull request review run and stores the initial queued state.
   *
   * @param input - Pull request review input payload.
   * @returns Newly created workflow run.
   */
  public startPullRequestReview(input: StartPullRequestReviewInput): WorkflowRun {
    const now = new Date().toISOString();

    const run: WorkflowRun = {
      artifacts: createInitialArtifacts(),
      confidence: 0,
      createdAt: now,
      failureReason: null,
      followUpTasks: [],
      id: randomUUID(),
      promptVersion: "pr-review-prompts/v1",
      pullRequestNumber: input.pullRequestNumber,
      repository: input.repository,
      risks: [],
      status: "queued",
      suggestedTests: [],
      suggestions: [],
      summary: `PR #${input.pullRequestNumber}: ${input.pullRequestTitle}`,
      workflowVersion: "pr-review-workflow/v1",
      updatedAt: now,
      workflowType: "pr_summary"
    };

    this.runs.set(run.id, run);
    this.publishRunUpdated(run);

    if (this.autoProgress) {
      void this.executeWorkflow(run.id, input);
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
   * Publishes run update events for subscribers.
   *
   * @param run - Updated run payload.
   */
  private publishRunUpdated(run: WorkflowRun): void {
    this.pubSub.publish(RUN_UPDATED_EVENT, {
      runUpdated: run
    });
  }

  private async executeWorkflow(
    runId: string,
    input: StartPullRequestReviewInput
  ): Promise<void> {
    logRunEvent("workflow_started", {
      pullRequestNumber: input.pullRequestNumber,
      repository: input.repository,
      runId
    });

    try {
      this.transitionRunStatus(runId, "running");

      const workflowResult = await this.workflowExecutor(input);
      const existingRun = this.runs.get(runId);

      if (!existingRun) {
        return;
      }

      const updatedAt = new Date().toISOString();
      const run: WorkflowRun = {
        ...existingRun,
        artifacts: workflowResult.artifacts,
        confidence: workflowResult.output.confidence,
        failureReason: null,
        followUpTasks: workflowResult.output.followUpTasks,
        promptVersion: workflowResult.output.promptVersion,
        risks: workflowResult.output.risks,
        status: "waiting_for_approval",
        suggestedTests: workflowResult.output.suggestedTests,
        summary: workflowResult.output.summary,
        updatedAt,
        workflowVersion: workflowResult.output.workflowVersion
      };

      run.suggestions = createSuggestionsFromWorkflowOutput(run, updatedAt);

      this.runs.set(runId, run);
      this.publishRunUpdated(run);
      logRunEvent("workflow_waiting_for_approval", {
        pullRequestNumber: run.pullRequestNumber,
        repository: run.repository,
        runId
      });
      this.scheduleCompletion(runId);
    } catch (error) {
      try {
        this.markRunFailed(runId, error);
      } catch {
        // Ignore failures for disposed or missing runs in development mode.
      }
    }
  }

  private scheduleCompletion(runId: string): void {
    const timer = setTimeout(() => {
      this.scheduledTimers.delete(timer);

      try {
        const completedRun = this.transitionRunStatus(runId, "completed");
        logRunEvent("workflow_completed", {
          pullRequestNumber: completedRun.pullRequestNumber,
          repository: completedRun.repository,
          runId
        });
      } catch {
        // Ignore failures for disposed or missing runs in development mode.
      }
    }, this.lifecycleDelayMs);

    this.scheduledTimers.add(timer);
  }

  private markRunFailed(runId: string, error: unknown): void {
    const existingRun = this.runs.get(runId);

    if (!existingRun) {
      return;
    }

    if (!canTransitionRunStatus(existingRun.status, "failed")) {
      throw new Error(`Invalid transition from ${existingRun.status} to failed`);
    }

    const failedRun: WorkflowRun = {
      ...existingRun,
      failureReason: toFailureReason(error),
      status: "failed",
      updatedAt: new Date().toISOString()
    };

    this.runs.set(runId, failedRun);
    this.publishRunUpdated(failedRun);
    logRunEvent("workflow_failed", {
      error: serializeError(error),
      failureReason: failedRun.failureReason,
      pullRequestNumber: failedRun.pullRequestNumber,
      repository: failedRun.repository,
      runId
    });
  }
}
