import type { ReactElement } from "react";

import type {
  ApprovalDecisionView,
  CommentPublicationView,
  WorkflowRunView
} from "./workflow-types";

export interface RunDetailPanelProps {
  approvalsBySuggestionId: Record<string, ApprovalDecisionView>;
  isApproving: boolean;
  isPublishing: boolean;
  onApprove: (suggestionId: string, decision: "approved" | "rejected") => void;
  onPublish: () => void;
  publications: CommentPublicationView[];
  run: WorkflowRunView | null;
}

/**
 * Renders run detail section with approval and publication controls.
 *
 * @param props - Run detail panel props.
 * @returns Run detail panel UI.
 */
export function RunDetailPanel(props: RunDetailPanelProps): ReactElement {
  if (!props.run) {
    return (
      <article className="panel panel--detail">
        <h2>Run Details</h2>
        <p>Select a run to view details.</p>
      </article>
    );
  }

  const allApproved =
    props.run.suggestions.length > 0 &&
    props.run.suggestions.every(
      (suggestion) => props.approvalsBySuggestionId[suggestion.id]?.decision === "approved"
    );

  return (
    <article className="panel panel--detail">
      <h2>Run Details</h2>
      <p>
        <strong>Status:</strong> {props.run.status}
      </p>
      <p>
        <strong>Confidence:</strong> {props.run.confidence}
      </p>
      <p>
        <strong>Summary:</strong> {props.run.summary}
      </p>
      {props.run.status === "failed" && props.run.failureReason ? (
        <p className="error">
          <strong>Failure:</strong> {props.run.failureReason}
        </p>
      ) : null}

      <section>
        <h3>Suggestion Approvals</h3>
        {props.run.suggestions.length === 0 ? <p>No suggestions available.</p> : null}
        <ul className="suggestion-list">
          {props.run.suggestions.map((suggestion) => {
            const approval = props.approvalsBySuggestionId[suggestion.id];
            const kindClass = toKindClass(suggestion.kind);
            const decisionClass = approval?.decision ?? "pending";

            return (
              <li
                key={suggestion.id}
                className={`suggestion-item suggestion-item--${kindClass} suggestion-item--${decisionClass}`}
              >
                <p className="suggestion-heading">
                  <span className={`kind-pill kind-pill--${kindClass}`}>
                    {toKindLabel(suggestion.kind)}
                  </span>
                </p>
                <p className="suggestion-content">{suggestion.content}</p>
                <p className={`approval-status approval-status--${decisionClass}`}>
                  Decision: {decisionClass}
                </p>
                <div className="actions actions--inline">
                  <button
                    type="button"
                    disabled={props.isApproving}
                    onClick={() => props.onApprove(suggestion.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={props.isApproving}
                    onClick={() => props.onApprove(suggestion.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3>Publish</h3>
        <button
          type="button"
          disabled={props.isPublishing || !allApproved}
          onClick={props.onPublish}
        >
          {props.isPublishing ? "Publishing..." : "Publish to GitHub"}
        </button>
        {!allApproved ? <p>All suggestions must be approved before publishing.</p> : null}
        <ul>
          {props.publications.map((publication) => (
            <li key={publication.id}>
              <a href={publication.publishedUrl} rel="noreferrer" target="_blank">
                Published comment {publication.commentId}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <DetailList kind="risk" title="Risks" values={props.run.risks} />
      <DetailList kind="test" title="Suggested Tests" values={props.run.suggestedTests} />
      <DetailList kind="follow_up" title="Follow-up Tasks" values={props.run.followUpTasks} />
    </article>
  );
}

/**
 * Renders a simple list section with empty-state fallback.
 *
 * @param props - Detail section title and item values.
 * @returns Detail list content block.
 */
function DetailList(props: {
  kind: "follow_up" | "risk" | "test";
  title: string;
  values: string[];
}): ReactElement {
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
      <ul className="detail-box-list">
        {props.values.map((value) => (
          <li key={value} className={`detail-box detail-box--${props.kind}`}>
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

function toKindClass(kind: string): "follow_up" | "risk" | "test" {
  if (kind === "risk" || kind === "test" || kind === "follow_up") {
    return kind;
  }

  return "follow_up";
}

function toKindLabel(kind: string): string {
  if (kind === "follow_up") {
    return "Follow-up";
  }

  if (kind === "risk") {
    return "Risk";
  }

  if (kind === "test") {
    return "Test";
  }

  return "Suggestion";
}
