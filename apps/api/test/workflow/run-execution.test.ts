import { describe, expect, it } from "vitest";

import { InMemoryRunStore } from "../../src/workflow/run-store";

describe("run workflow execution", () => {
  it("applies workflow output and completes lifecycle", async () => {
    const runStore = new InMemoryRunStore({
      autoProgress: true,
      lifecycleDelayMs: 5,
      workflowExecutor: async () => ({
        artifacts: {
          normalizedOutput: {
            confidence: 0.82,
            followUpTasks: ["Document rollback checklist."],
            risks: ["Token boundary edge case."],
            suggestedTests: ["Add regression test for expired refresh token."],
            summary: "PR updates auth refresh and cache behavior."
          },
          rawModelResponses: {
            followUpTasks: '{"items":["Document rollback checklist."]}',
            risks: '{"items":["Token boundary edge case."]}',
            suggestedTests:
              '{"items":["Add regression test for expired refresh token."]}',
            summary: "PR updates auth refresh and cache behavior."
          }
        },
        output: {
          confidence: 0.82,
          followUpTasks: ["Document rollback checklist."],
          promptVersion: "pr-review-prompts/v1",
          risks: ["Token boundary edge case."],
          suggestedTests: ["Add regression test for expired refresh token."],
          summary: "PR updates auth refresh and cache behavior.",
          workflowVersion: "pr-review-workflow/v1"
        }
      })
    });

    const run = runStore.startPullRequestReview({
      pullRequestNumber: 18,
      pullRequestTitle: "Improve refresh token handling",
      repository: "acme/auth-service"
    });

    const completedRun = await waitForRunStatus(runStore, run.id, "completed");

    expect(completedRun.summary).toContain("auth refresh");
    expect(completedRun.confidence).toBe(0.82);
    expect(completedRun.risks).toEqual(["Token boundary edge case."]);
    expect(completedRun.suggestedTests).toEqual([
      "Add regression test for expired refresh token."
    ]);
    expect(completedRun.followUpTasks).toEqual(["Document rollback checklist."]);
    expect(completedRun.suggestions.map((item) => item.kind)).toEqual([
      "risk",
      "test",
      "follow_up"
    ]);
    expect(completedRun.artifacts.rawModelResponses.risks).toContain("items");

    runStore.dispose();
  });

  it("marks runs as failed when workflow execution throws", async () => {
    const runStore = new InMemoryRunStore({
      autoProgress: true,
      lifecycleDelayMs: 5,
      workflowExecutor: async () => {
        throw new Error("workflow failure");
      }
    });

    const run = runStore.startPullRequestReview({
      pullRequestNumber: 19,
      pullRequestTitle: "Adjust billing retries",
      repository: "acme/billing-service"
    });

    const failedRun = await waitForRunStatus(runStore, run.id, "failed");

    expect(failedRun.failureReason).toContain("workflow failure");
    expect(failedRun.status).toBe("failed");
    expect(failedRun.summary).toContain("Adjust billing retries");

    runStore.dispose();
  });
});

async function waitForRunStatus(
  runStore: InMemoryRunStore,
  runId: string,
  status: "completed" | "failed"
) {
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const run = runStore.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (run.status === status) {
      return run;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(`Run did not reach status ${status} within expected time`);
}
