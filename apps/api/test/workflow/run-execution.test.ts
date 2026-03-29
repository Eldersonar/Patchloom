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
    expect(completedRun.suggestions.every((item) => item.sourceRefs.length === 0)).toBe(
      true
    );
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

  it("formats zod-like validation errors into concise failure reasons", async () => {
    const runStore = new InMemoryRunStore({
      autoProgress: true,
      lifecycleDelayMs: 5,
      workflowExecutor: async () => {
        const validationError = new Error("validation failure");
        Object.assign(validationError, {
          issues: [
            {
              message: "Invalid input: expected string, received object",
              path: ["items", 0]
            },
            {
              message: "Invalid input: expected string, received object",
              path: ["items", 1]
            }
          ],
          name: "ZodError"
        });
        throw validationError;
      }
    });

    const run = runStore.startPullRequestReview({
      pullRequestNumber: 20,
      pullRequestTitle: "Improve result parsing",
      repository: "acme/parsing-service"
    });

    const failedRun = await waitForRunStatus(runStore, run.id, "failed");

    expect(failedRun.failureReason).toContain(
      "Model output validation failed at items.0"
    );
    expect(failedRun.failureReason).toContain("+1 more issues");
    runStore.dispose();
  });

  it("attaches source refs and filters unsupported suggestions when changed files are available", async () => {
    const runStore = new InMemoryRunStore({
      autoProgress: true,
      lifecycleDelayMs: 5,
      workflowExecutor: async () => ({
        artifacts: {
          normalizedOutput: {
            confidence: 0.78,
            followUpTasks: [
              "Document cache invalidation rationale for auth/session module.",
              "Schedule roadmap brainstorming sync."
            ],
            risks: [
              "Token refresh logic may fail near expiry boundaries.",
              "Completely unrelated hardware procurement process."
            ],
            suggestedTests: [
              "Add integration test for profile cache refresh after update."
            ],
            summary: "PR updates auth refresh and profile cache behavior."
          },
          rawModelResponses: {
            followUpTasks:
              '{"items":["Document cache invalidation rationale for auth/session module.","Schedule roadmap brainstorming sync."]}',
            risks:
              '{"items":["Token refresh logic may fail near expiry boundaries.","Completely unrelated hardware procurement process."]}',
            suggestedTests:
              '{"items":["Add integration test for profile cache refresh after update."]}',
            summary: "PR updates auth refresh and profile cache behavior."
          }
        },
        output: {
          confidence: 0.78,
          followUpTasks: [
            "Document cache invalidation rationale for auth/session module.",
            "Schedule roadmap brainstorming sync."
          ],
          promptVersion: "pr-review-prompts/v1",
          risks: [
            "Token refresh logic may fail near expiry boundaries.",
            "Completely unrelated hardware procurement process."
          ],
          suggestedTests: [
            "Add integration test for profile cache refresh after update."
          ],
          summary: "PR updates auth refresh and profile cache behavior.",
          workflowVersion: "pr-review-workflow/v1"
        }
      })
    });

    const run = runStore.startPullRequestReview({
      changedFiles: [
        "src/auth/session.ts (modified, +12/-4): @@ -17,7 +17,9 @@ if (expired) refreshToken(user)",
        "src/profile/cache.ts (modified, +8/-1): @@ -42,5 +42,8 @@ profileCache.set(userId, nextValue)"
      ],
      pullRequestNumber: 21,
      pullRequestTitle: "Improve auth refresh and profile cache handling",
      repository: "acme/auth-service"
    });

    const completedRun = await waitForRunStatus(runStore, run.id, "completed");

    expect(completedRun.risks).toEqual([
      "Token refresh logic may fail near expiry boundaries."
    ]);
    expect(completedRun.followUpTasks).toEqual([
      "Document cache invalidation rationale for auth/session module."
    ]);
    expect(completedRun.suggestedTests).toEqual([
      "Add integration test for profile cache refresh after update."
    ]);
    expect(completedRun.suggestions).toHaveLength(3);
    expect(completedRun.suggestions.every((item) => item.sourceRefs.length > 0)).toBe(
      true
    );

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
