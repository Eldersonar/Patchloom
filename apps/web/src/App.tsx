import { useEffect, useMemo, useState, type ReactElement } from "react";

import {
  approveSuggestion,
  fetchRuns,
  listApprovalDecisions,
  listCommentPublications,
  publishComment,
  startPullRequestReview,
  subscribeRunUpdated
} from "./graphql-client";
import {
  buildPublishBody,
  buildPullRequestUrl,
  errorMessage,
  mergeRun
} from "./run-utils";
import { RunDetailPanel } from "./run-detail-panel";
import type {
  ApprovalDecisionView,
  CommentPublicationView,
  WorkflowRunView
} from "./workflow-types";
import "./app.css";

/**
 * Renders workflow dashboard with run list, details, and live updates.
 *
 * @returns Web application shell.
 */
export function App(): ReactElement {
  const [approvalsBySuggestionId, setApprovalsBySuggestionId] = useState<
    Record<string, ApprovalDecisionView>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isLoadingRunMeta, setIsLoadingRunMeta] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [publications, setPublications] = useState<CommentPublicationView[]>([]);
  const [runs, setRuns] = useState<WorkflowRunView[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [formRepository, setFormRepository] = useState("Eldersonar/Patchloom");
  const [formPullRequestNumber, setFormPullRequestNumber] = useState(1);
  const [formPullRequestTitle, setFormPullRequestTitle] = useState(
    "Improve auth refresh flow"
  );

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setApprovalsBySuggestionId({});
      setPublications([]);
      return undefined;
    }

    void loadRunGovernance(selectedRunId);

    const unsubscribe = subscribeRunUpdated(
      selectedRunId,
      (updatedRun) => {
        setRuns((currentRuns) => mergeRun(updatedRun, currentRuns));
      },
      (subscriptionError) => {
        setError(subscriptionError.message);
      }
    );

    return unsubscribe;
  }, [selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  async function loadRuns(): Promise<void> {
    setIsLoadingRuns(true);
    setError(null);

    try {
      const fetchedRuns = await fetchRuns();
      setRuns(fetchedRuns);

      if (!selectedRunId && fetchedRuns.length > 0) {
        setSelectedRunId(fetchedRuns[0]?.id ?? null);
      }
    } catch (loadError) {
      setError(errorMessage(loadError, "Failed to load workflow runs"));
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function loadRunGovernance(runId: string): Promise<void> {
    setIsLoadingRunMeta(true);
    setError(null);

    try {
      const [decisions, fetchedPublications] = await Promise.all([
        listApprovalDecisions(runId),
        listCommentPublications(runId)
      ]);

      const mappedDecisions = decisions.reduce<Record<string, ApprovalDecisionView>>(
        (accumulator, decision) => {
          accumulator[decision.suggestionId] = decision;
          return accumulator;
        },
        {}
      );

      setApprovalsBySuggestionId(mappedDecisions);
      setPublications(fetchedPublications);
    } catch (loadError) {
      setError(errorMessage(loadError, "Failed to load run approval data"));
    } finally {
      setIsLoadingRunMeta(false);
    }
  }

  async function handleStartRun(): Promise<void> {
    setIsStartingRun(true);
    setError(null);

    try {
      const startedRun = await startPullRequestReview({
        pullRequestNumber: formPullRequestNumber,
        pullRequestTitle: formPullRequestTitle,
        repository: formRepository
      });

      setRuns((currentRuns) => mergeRun(startedRun, currentRuns));
      setSelectedRunId(startedRun.id);
    } catch (startError) {
      setError(errorMessage(startError, "Failed to start run"));
    } finally {
      setIsStartingRun(false);
    }
  }

  async function handleApproveSuggestion(
    suggestionId: string,
    decision: "approved" | "rejected"
  ): Promise<void> {
    if (!selectedRunId) {
      return;
    }

    setIsApproving(true);
    setError(null);

    try {
      const savedDecision = await approveSuggestion({
        actor: "dashboard-user",
        decision,
        runId: selectedRunId,
        suggestionId
      });

      setApprovalsBySuggestionId((current) => ({
        ...current,
        [savedDecision.suggestionId]: savedDecision
      }));
    } catch (approvalError) {
      setError(errorMessage(approvalError, "Failed to save suggestion decision"));
    } finally {
      setIsApproving(false);
    }
  }

  async function handlePublishComment(): Promise<void> {
    if (!selectedRun) {
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const publication = await publishComment({
        body: buildPublishBody(selectedRun),
        idempotencyKey: `run-${selectedRun.id}-summary-v1`,
        runId: selectedRun.id,
        target: buildPullRequestUrl(selectedRun)
      });

      setPublications((current) => {
        if (current.some((existing) => existing.id === publication.id)) {
          return current;
        }

        return [publication, ...current];
      });
    } catch (publishError) {
      setError(errorMessage(publishError, "Failed to publish comment"));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <h1>Patchloom</h1>
        <p>Workflow assistant dashboard</p>
      </header>

      <section className="panel panel--form">
        <h2>Start Pull Request Review</h2>
        <div className="form-grid">
          <label>
            Repository
            <input
              value={formRepository}
              onChange={(event) => setFormRepository(event.target.value)}
            />
          </label>
          <label>
            PR Number
            <input
              type="number"
              value={formPullRequestNumber}
              onChange={(event) =>
                setFormPullRequestNumber(Number.parseInt(event.target.value, 10) || 0)
              }
            />
          </label>
          <label>
            PR Title (fallback only)
            <input
              value={formPullRequestTitle}
              onChange={(event) => setFormPullRequestTitle(event.target.value)}
            />
          </label>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void handleStartRun()} disabled={isStartingRun}>
            {isStartingRun ? "Starting..." : "Start Run"}
          </button>
          <button type="button" onClick={() => void loadRuns()} disabled={isLoadingRuns}>
            {isLoadingRuns ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="content">
        <aside className="panel panel--list">
          <h2>Runs</h2>
          {runs.length === 0 ? <p>No runs yet.</p> : null}
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className={run.id === selectedRunId ? "active" : ""}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <span>{run.repository}</span>
                  <span>#{run.pullRequestNumber}</span>
                  <span>{run.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <>
          {isLoadingRunMeta ? <p>Loading approvals and publications...</p> : null}
          <RunDetailPanel
            approvalsBySuggestionId={approvalsBySuggestionId}
            isApproving={isApproving}
            isPublishing={isPublishing}
            onApprove={(suggestionId, decision) => {
              void handleApproveSuggestion(suggestionId, decision);
            }}
            onPublish={() => {
              void handlePublishComment();
            }}
            publications={publications}
            run={selectedRun}
          />
        </>
      </section>
    </main>
  );
}
