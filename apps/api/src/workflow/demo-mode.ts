import type { StartPullRequestReviewInput } from "@patchloom/core";

import type { InMemoryRunStore } from "./run-store";

export const DEMO_PULL_REQUEST_INPUTS: StartPullRequestReviewInput[] = [
  {
    pullRequestNumber: 281,
    pullRequestTitle: "Improve auth refresh and profile cache handling",
    repository: "acme/payments"
  },
  {
    pullRequestNumber: 304,
    pullRequestTitle: "Harden CI config loading for staging environments",
    repository: "acme/platform"
  }
];

/**
 * Seeds representative demo runs so local dashboards have immediate data.
 *
 * @param runStore - In-memory run store instance.
 * @returns Identifiers of created demo runs.
 */
export function seedDemoRuns(runStore: InMemoryRunStore): string[] {
  return DEMO_PULL_REQUEST_INPUTS.map((input) => runStore.startPullRequestReview(input).id);
}
