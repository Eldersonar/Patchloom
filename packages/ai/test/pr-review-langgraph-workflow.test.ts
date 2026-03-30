import { describe, expect, it } from "vitest";

import type {
  ModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult
} from "../src/model-provider";
import {
  runPullRequestReviewLangGraphWorkflow,
  type PullRequestReviewWorkflowInput
} from "../src/index";

class StubModelProvider implements ModelProvider {
  private readonly structuredFailureCount: number;

  private structuredAttempt = 0;

  /**
   * Creates a deterministic provider for LangGraph workflow tests.
   *
   * @param structuredFailureCount - Number of initial structured calls to fail.
   */
  public constructor(structuredFailureCount = 0) {
    this.structuredFailureCount = structuredFailureCount;
  }

  /**
   * Returns deterministic summary text.
   *
   * @param request - Text generation request.
   * @returns Generated text result.
   */
  public async generateText(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult> {
    return {
      model: request.model ?? "stub-model",
      provider: "stub",
      text: "Summary: updates auth refresh and profile cache handling."
    };
  }

  /**
   * Returns deterministic structured data based on prompt contents.
   *
   * @param request - Structured generation request.
   * @returns Parsed structured result.
   */
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

  /**
   * Maps workflow prompt categories to deterministic list payloads.
   *
   * @param prompt - Prompt text.
   * @returns Structured payload with `items`.
   */
  private resolvePayload(prompt: string): { items: string[] } {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("risk")) {
      return {
        items: [
          "Token expiry edge case on refresh boundary.",
          "Stale profile cache after logout/login.",
          "Session restore race between tabs can misread auth state.",
          "Refresh retry loop could amplify backend traffic spikes.",
          "Error mapping may hide 401 root cause from client metrics."
        ]
      };
    }

    if (lowerPrompt.includes("test suggestions")) {
      return {
        items: [
          "Regression test for token refresh when refresh token expires.",
          "E2E test for logout/login after profile update.",
          "Contract test for cache refresh on profile save.",
          "Unit test for refresh jitter backoff behavior.",
          "Integration test for token exchange retry behavior."
        ]
      };
    }

    return {
      items: [
        "Add follow-up issue for cache invalidation assumptions.",
        "Document auth refresh rollback procedure.",
        "Track stale-session telemetry counters."
      ]
    };
  }
}

const BASE_INPUT: PullRequestReviewWorkflowInput = {
  pullRequestNumber: 281,
  pullRequestTitle: "Update token refresh and profile cache handling",
  repository: "acme/payments-api"
};

describe("pr-review-langgraph-workflow", () => {
  it("runs workflow and returns structured output plus artifacts", async () => {
    const provider = new StubModelProvider();

    const result = await runPullRequestReviewLangGraphWorkflow({
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

    const result = await runPullRequestReviewLangGraphWorkflow({
      input: BASE_INPUT,
      maxRetries: 1,
      provider
    });

    expect(result.output.risks.length).toBeGreaterThan(0);
  });

  it("applies stricter item caps for scaffold pull requests", async () => {
    const provider = new StubModelProvider();

    const result = await runPullRequestReviewLangGraphWorkflow({
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
        pullRequestTitle: "Initial scaffold setup",
        repository: "acme/platform"
      },
      provider
    });

    expect(result.output.risks.length).toBeLessThanOrEqual(3);
    expect(result.output.suggestedTests.length).toBeLessThanOrEqual(4);
    expect(result.output.followUpTasks.length).toBeLessThanOrEqual(2);
  });
});
