import { useEffect, useMemo, useState, type ReactElement } from "react";

import {
  fetchRuns,
  startPullRequestReview,
  subscribeRunUpdated
} from "./graphql-client";
import type { WorkflowRunView } from "./workflow-types";
import "./app.css";

/**
 * Renders workflow dashboard with run list, details, and live updates.
 *
 * @returns Web application shell.
 */
export function App(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [runs, setRuns] = useState<WorkflowRunView[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [formRepository, setFormRepository] = useState("acme/payments");
  const [formPullRequestNumber, setFormPullRequestNumber] = useState(302);
  const [formPullRequestTitle, setFormPullRequestTitle] = useState(
    "Improve auth refresh flow"
  );

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      return undefined;
    }

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
            PR Title
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

        <article className="panel panel--detail">
          <h2>Run Details</h2>
          {!selectedRun ? <p>Select a run to view details.</p> : null}
          {selectedRun ? (
            <>
              <p>
                <strong>Status:</strong> {selectedRun.status}
              </p>
              <p>
                <strong>Confidence:</strong> {selectedRun.confidence}
              </p>
              <p>
                <strong>Summary:</strong> {selectedRun.summary}
              </p>
              <DetailList title="Risks" values={selectedRun.risks} />
              <DetailList title="Suggested Tests" values={selectedRun.suggestedTests} />
              <DetailList title="Follow-up Tasks" values={selectedRun.followUpTasks} />
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}

/**
 * Renders a detail list section with fallback text when empty.
 *
 * @param props - Section title and values.
 * @returns Detail list UI block.
 */
function DetailList(props: { title: string; values: string[] }): ReactElement {
  if (props.values.length === 0) {
    return (
      <section>
        <h3>{props.title}</h3>
        <p>None</p>
      </section>
    );
  }

  return (
    <section>
      <h3>{props.title}</h3>
      <ul>
        {props.values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Merges an updated run into the current run list while keeping newest first.
 *
 * @param newRun - Updated run payload.
 * @param runs - Existing run list.
 * @returns Updated run list.
 */
function mergeRun(newRun: WorkflowRunView, runs: WorkflowRunView[]): WorkflowRunView[] {
  const filteredRuns = runs.filter((run) => run.id !== newRun.id);
  return [newRun, ...filteredRuns];
}

/**
 * Converts unknown errors into user-facing messages.
 *
 * @param error - Unknown thrown value.
 * @param fallback - Fallback message when error is not an Error instance.
 * @returns Human-readable error text.
 */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
