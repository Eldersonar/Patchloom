import { randomUUID } from "node:crypto";

import { type WorkflowRun } from "@patchloom/core";

import type { InMemoryRunStore } from "./run-store";

export type SuggestionDecision = "approved" | "rejected";

export interface ApprovalDecision {
  actor: string;
  createdAt: string;
  decision: SuggestionDecision;
  id: string;
  runId: string;
  suggestionId: string;
}

export interface ApproveSuggestionInput {
  actor: string;
  decision: SuggestionDecision;
  runId: string;
  suggestionId: string;
}

export interface CommentPublication {
  body: string;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  runId: string;
  target: string;
}

export interface PublishCommentInput {
  body: string;
  idempotencyKey: string;
  runId: string;
  target: string;
}

/**
 * In-memory approval/publication store for suggestion governance in MVP.
 */
export class InMemoryReviewGovernanceStore {
  private readonly decisionsByRun = new Map<string, Map<string, ApprovalDecision>>();

  private readonly publicationsByRun = new Map<string, Map<string, CommentPublication>>();

  /**
   * Approves or rejects a suggestion for a run.
   *
   * @param runStore - Run store used for validation.
   * @param input - Approval decision payload.
   * @returns Stored approval decision.
   */
  public approveSuggestion(
    runStore: InMemoryRunStore,
    input: ApproveSuggestionInput
  ): ApprovalDecision {
    const run = runStore.getRun(input.runId);

    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    ensureSuggestionExists(run, input.suggestionId);

    const createdAt = new Date().toISOString();
    const decision: ApprovalDecision = {
      actor: input.actor,
      createdAt,
      decision: input.decision,
      id: randomUUID(),
      runId: input.runId,
      suggestionId: input.suggestionId
    };

    const decisionsForRun = getOrCreateNestedMap(this.decisionsByRun, input.runId);
    decisionsForRun.set(input.suggestionId, decision);

    return decision;
  }

  /**
   * Lists approval decisions for a run.
   *
   * @param runId - Workflow run identifier.
   * @returns Approval decisions for the run.
   */
  public listApprovalDecisions(runId: string): ApprovalDecision[] {
    return [...(this.decisionsByRun.get(runId)?.values() ?? [])];
  }

  /**
   * Publishes a comment for a run after approval checks pass.
   *
   * @param runStore - Run store used for validation.
   * @param input - Comment publication payload.
   * @returns Existing or newly created publication record.
   */
  public publishComment(
    runStore: InMemoryRunStore,
    input: PublishCommentInput
  ): CommentPublication {
    const run = runStore.getRun(input.runId);

    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    const publicationsForRun = getOrCreateNestedMap(
      this.publicationsByRun,
      input.runId
    );
    const existing = publicationsForRun.get(input.idempotencyKey);

    if (existing) {
      return existing;
    }

    ensureAllSuggestionsApproved(run, this.listApprovalDecisions(input.runId));

    const publication: CommentPublication = {
      body: input.body,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      runId: input.runId,
      target: input.target
    };

    publicationsForRun.set(input.idempotencyKey, publication);
    return publication;
  }

  /**
   * Lists comment publications for a run.
   *
   * @param runId - Workflow run identifier.
   * @returns Publications for the run.
   */
  public listCommentPublications(runId: string): CommentPublication[] {
    return [...(this.publicationsByRun.get(runId)?.values() ?? [])];
  }
}

function ensureSuggestionExists(run: WorkflowRun, suggestionId: string): void {
  const suggestionExists = run.suggestions.some(
    (suggestion) => suggestion.id === suggestionId
  );

  if (!suggestionExists) {
    throw new Error(
      `Suggestion not found for run ${run.id}: ${suggestionId}`
    );
  }
}

function ensureAllSuggestionsApproved(
  run: WorkflowRun,
  decisions: ApprovalDecision[]
): void {
  const approvedSuggestionIds = new Set(
    decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.suggestionId)
  );

  const missingApprovals = run.suggestions.filter(
    (suggestion) => !approvedSuggestionIds.has(suggestion.id)
  );

  if (missingApprovals.length > 0) {
    throw new Error(
      `Cannot publish comment. Missing approvals for ${missingApprovals.length} suggestion(s).`
    );
  }
}

function getOrCreateNestedMap<TItem>(
  map: Map<string, Map<string, TItem>>,
  key: string
): Map<string, TItem> {
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const created = new Map<string, TItem>();
  map.set(key, created);
  return created;
}
