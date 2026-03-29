import type { WorkflowRunView } from "./workflow-types";

/**
 * Merges an updated run into the current run list while keeping newest first.
 *
 * @param newRun - Updated run payload.
 * @param runs - Existing run list.
 * @returns Updated run list.
 */
export function mergeRun(
  newRun: WorkflowRunView,
  runs: WorkflowRunView[]
): WorkflowRunView[] {
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
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

/**
 * Builds canonical pull request URL from run metadata.
 *
 * @param run - Workflow run payload.
 * @returns Pull request URL.
 */
export function buildPullRequestUrl(run: WorkflowRunView): string {
  return `https://github.com/${run.repository}/pull/${run.pullRequestNumber}`;
}

/**
 * Builds publishable PR comment body from structured run fields.
 *
 * @param run - Workflow run payload.
 * @returns Markdown comment body.
 */
export function buildPublishBody(run: WorkflowRunView): string {
  const section = (title: string, values: string[]): string => {
    if (values.length === 0) {
      return `### ${title}\n- None`;
    }

    const bullets = values.map((value) => `- ${value}`).join("\n");
    return `### ${title}\n${bullets}`;
  };

  return [
    "## Patchloom Review Summary",
    "",
    run.summary,
    "",
    section("Risks", run.risks),
    "",
    section("Suggested Tests", run.suggestedTests),
    "",
    section("Follow-up Tasks", run.followUpTasks)
  ].join("\n");
}
