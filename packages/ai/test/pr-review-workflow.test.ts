import { describe, expect, it } from "vitest";

import type {
  ModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult
} from "../src/model-provider";
import {
  ModelCallTimeoutError,
  calculateConfidence,
  generateRisksNode,
  generateSummaryNode,
  runPullRequestReviewWorkflow,
  type PullRequestReviewWorkflowInput
} from "../src/workflows/pr-review-workflow";

class StubModelProvider implements ModelProvider {
  private readonly structuredFailureCount: number;

  private structuredAttempt = 0;

  public constructor(structuredFailureCount = 0) {
    this.structuredFailureCount = structuredFailureCount;
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

  private resolvePayload(prompt: string): { items: string[] } {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("risk")) {
      return {
        items: [
          "Token expiry edge case on refresh boundary.",
          "Stale profile cache after logout/login."
        ]
      };
    }

    if (lowerPrompt.includes("test suggestions")) {
      return {
        items: [
          "Regression test for token refresh when refresh token expires.",
          "E2E test for logout/login after profile update."
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

  it("fails fast for non-retryable model errors", async () => {
    let structuredCalls = 0;
    const provider: ModelProvider = {
      async generateText() {
        return {
          model: "stub-model",
          provider: "stub",
          text: "Summary output"
        };
      },
      async generateStructured() {
        structuredCalls += 1;
        throw new Error("schema validation failed");
      }
    };

    await expect(
      runPullRequestReviewWorkflow({
        input: BASE_INPUT,
        maxRetries: 3,
        provider
      })
    ).rejects.toThrowError(/schema validation failed/);

    expect(structuredCalls).toBe(1);
  });

  it("marks model call timeouts as terminal workflow failures", async () => {
    const provider: ModelProvider = {
      async generateText() {
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });

        return {
          model: "stub-model",
          provider: "stub",
          text: "Summary output"
        };
      },
      async generateStructured(request) {
        const parsed = request.schema.parse({ items: ["fallback item"] });
        return {
          data: parsed,
          model: "stub-model",
          provider: "stub",
          text: JSON.stringify(parsed)
        };
      }
    };

    await expect(
      runPullRequestReviewWorkflow({
        input: BASE_INPUT,
        provider,
        retryPolicy: {
          timeoutMs: 5
        }
      })
    ).rejects.toBeInstanceOf(ModelCallTimeoutError);
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

    expect(confidence).toBe(0.95);
  });
});
