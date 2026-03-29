import { describe, expect, it } from "vitest";

import type {
  ModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult
} from "../src/model-provider";
import {
  calculateConfidence,
  generateRisksNode,
  generateSummaryNode,
  runPullRequestReviewWorkflow,
  type PullRequestReviewWorkflowInput
} from "../src/workflows/pr-review-workflow";

class StubModelProvider implements ModelProvider {
  private readonly objectListMode: boolean;

  private readonly structuredFailureCount: number;

  private structuredAttempt = 0;

  public constructor(structuredFailureCount = 0, objectListMode = false) {
    this.structuredFailureCount = structuredFailureCount;
    this.objectListMode = objectListMode;
  }

  public async generateText(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult> {
    return {
      model: request.model ?? "stub-model",
      provider: "stub",
      text: "Summary: updates auth refresh and profile cache handling."
    };
  }

  public async generateStructured<TOutput>(
    request: StructuredGenerationRequest<TOutput>
  ): Promise<StructuredGenerationResult<TOutput>> {
    this.structuredAttempt += 1;

    if (this.structuredAttempt <= this.structuredFailureCount) {
      throw new Error("temporary model error");
    }

    const payload = this.resolvePayload(request.prompt);
    const parsed = request.schema.parse(payload);

    return {
      data: parsed,
      model: request.model ?? "stub-model",
      provider: "stub",
      text: JSON.stringify(payload)
    };
  }

  private resolvePayload(prompt: string): { items: unknown[] } {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("test suggestions")) {
      if (this.objectListMode) {
        return {
          items: [
            { description: "Regression test for token refresh expiry handling." },
            {
              description: "E2E test for logout/login after profile update.",
              title: "E2E"
            },
            { description: "Contract test for cache refresh on profile save." },
            { description: "Unit test for refresh jitter backoff." },
            { description: "Smoke test for session restore on tab reload." },
            { description: "Integration test for token exchange retry flow." }
          ]
        };
      }

      return {
        items: [
          "Regression test for token refresh when refresh token expires.",
          "E2E test for logout/login after profile update.",
          "Contract test for cache refresh on profile save.",
          "Unit test for refresh jitter backoff behavior.",
          "Smoke test for session restore after browser reload.",
          "Integration test for token exchange retry behavior."
        ]
      };
    }

    if (lowerPrompt.includes("follow-up")) {
      if (this.objectListMode) {
        return {
          items: [
            { content: "Add follow-up issue for cache invalidation assumptions." },
            { content: "Document auth refresh rollback procedure." },
            { content: "Track stale-session telemetry counters." },
            { content: "Publish runbook for emergency refresh-token revocation." }
          ]
        };
      }

      return {
        items: [
          "Add follow-up issue for cache invalidation assumptions.",
          "Document auth refresh rollback procedure.",
          "Track stale-session telemetry counters.",
          "Publish runbook for emergency refresh-token revocation."
        ]
      };
    }

    if (lowerPrompt.includes("risk")) {
      if (this.objectListMode) {
        return {
          items: [
            { text: "Token expiry edge case on refresh boundary." },
            { text: "Stale profile cache after logout/login." },
            { text: "Session restore race between tabs can misread auth state." },
            { text: "Refresh retry loop could amplify backend traffic spikes." },
            { text: "Error mapping may hide 401 root cause from client metrics." },
            { text: "Rollback path may not clear stale credential artifacts." }
          ]
        };
      }

      return {
        items: [
          "Token expiry edge case on refresh boundary.",
          "Stale profile cache after logout/login.",
          "Session restore race between tabs can misread auth state.",
          "Refresh retry loop could amplify backend traffic spikes.",
          "Error mapping may hide 401 root cause from client metrics.",
          "Rollback path may not clear stale credential artifacts."
        ]
      };
    }

    if (this.objectListMode) {
      return {
        items: [
          { content: "Add follow-up issue for cache invalidation assumptions." },
          { content: "Document auth refresh rollback procedure." }
        ]
      };
    }

    return {
      items: [
        "Add follow-up issue for cache invalidation assumptions.",
        "Document auth refresh rollback procedure."
      ]
    };
  }
}

const BASE_INPUT: PullRequestReviewWorkflowInput = {
  pullRequestNumber: 281,
  pullRequestTitle: "Update token refresh and profile cache handling",
  repository: "acme/payments-api"
};

describe("pr-review-workflow", () => {
  it("runs workflow and returns structured output plus artifacts", async () => {
    const provider = new StubModelProvider();

    const result = await runPullRequestReviewWorkflow({
      input: BASE_INPUT,
      provider
    });

    expect(result.output.summary.length).toBeGreaterThan(10);
    expect(result.output.risks.length).toBeGreaterThan(0);
    expect(result.output.suggestedTests.length).toBeGreaterThan(0);
    expect(result.output.followUpTasks.length).toBeGreaterThan(0);
    expect(result.output.promptVersion).toBe("pr-review-prompts/v1");
    expect(result.output.workflowVersion).toBe("pr-review-workflow/v1");
    expect(result.output.confidence).toBeGreaterThan(0);
    expect(result.output.confidence).toBeLessThanOrEqual(1);

    expect(result.artifacts.normalizedOutput.summary).toBe(result.output.summary);
    expect(result.artifacts.rawModelResponses.risks).toContain("Token expiry");
  });

  it("retries node execution when model calls fail transiently", async () => {
    const provider = new StubModelProvider(1);

    const result = await runPullRequestReviewWorkflow({
      input: BASE_INPUT,
      maxRetries: 1,
      provider
    });

    expect(result.output.risks.length).toBeGreaterThan(0);
  });

  it("fails when retries are exhausted", async () => {
    const provider = new StubModelProvider(10);

    await expect(
      runPullRequestReviewWorkflow({
        input: BASE_INPUT,
        maxRetries: 1,
        provider
      })
    ).rejects.toThrowError(/temporary model error/);
  });

  it("tests summary and risk node functions directly", async () => {
    const provider = new StubModelProvider();

    const summaryNode = await generateSummaryNode(provider, BASE_INPUT);
    const risksNode = await generateRisksNode(provider, BASE_INPUT);

    expect(summaryNode.summary).toContain("auth refresh");
    expect(risksNode.risks[0]).toContain("Token expiry");
  });

  it("normalizes confidence deterministically", () => {
    const confidence = calculateConfidence({
      followUpTasks: ["a", "b"],
      risks: ["a", "b", "c"],
      suggestedTests: ["a", "b", "c", "d"],
      summary:
        "Summary text that is long enough to exercise deterministic confidence normalization."
    });

    expect(confidence).toBe(0.9);
  });

  it("normalizes object list items returned by provider", async () => {
    const provider = new StubModelProvider(0, true);

    const result = await runPullRequestReviewWorkflow({
      input: BASE_INPUT,
      provider
    });

    expect(result.output.risks[0]).toContain("Token expiry");
    expect(result.output.suggestedTests[0]).toContain("Regression test");
    expect(result.output.followUpTasks[0]).toContain("follow-up issue");
  });

  it("applies stricter item caps for scaffold pull requests", async () => {
    const provider = new StubModelProvider();

    const result = await runPullRequestReviewWorkflow({
      input: {
        changedFiles: [
          "apps/api/src/index.ts (added, +120/-0)",
          "apps/web/src/main.tsx (added, +90/-0)",
          "packages/core/src/index.ts (added, +60/-0)",
          "packages/ai/src/index.ts (added, +40/-0)",
          "docker-compose.yml (added, +25/-0)",
          "README.md (added, +75/-0)",
          ".github/workflows/ci.yml (added, +30/-0)",
          "pnpm-workspace.yaml (added, +8/-0)"
        ],
        pullRequestBody: "Bootstrap initial monorepo and baseline tooling.",
        pullRequestNumber: 1,
        pullRequestTitle: "Initial scaffold foundation",
        repository: "acme/platform"
      },
      provider
    });

    expect(result.output.risks).toHaveLength(3);
    expect(result.output.suggestedTests).toHaveLength(4);
    expect(result.output.followUpTasks).toHaveLength(2);
  });

  it("keeps broader risk caps for bugfix pull requests", async () => {
    const provider = new StubModelProvider();

    const result = await runPullRequestReviewWorkflow({
      input: {
        changedFiles: ["src/auth/session.ts (modified, +12/-6)"],
        pullRequestBody: "Fixes random logout bug after token refresh.",
        pullRequestNumber: 2,
        pullRequestTitle: "Fix refresh-token logout regression",
        repository: "acme/platform"
      },
      provider
    });

    expect(result.output.risks).toHaveLength(4);
  });
});
