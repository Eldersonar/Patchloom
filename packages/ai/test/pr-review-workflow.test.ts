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
  generateFollowUpTasksNode,
  generateRisksNode,
  generateSuggestedTestsNode,
  generateSummaryNode,
  type PullRequestReviewWorkflowInput
} from "../src/workflows/pr-review-workflow";

class StubModelProvider implements ModelProvider {
  private readonly objectListMode: boolean;

  /**
   * Creates a deterministic provider for workflow-node tests.
   *
   * @param objectListMode - Returns object-style lists when true.
   */
  public constructor(objectListMode = false) {
    this.objectListMode = objectListMode;
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
   * Returns deterministic structured data based on prompt category.
   *
   * @param request - Structured generation request.
   * @returns Parsed structured result.
   */
  public async generateStructured<TOutput>(
    request: StructuredGenerationRequest<TOutput>
  ): Promise<StructuredGenerationResult<TOutput>> {
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
   * Maps prompt category to deterministic list items.
   *
   * @param prompt - Prompt text.
   * @returns Structured payload with `items`.
   */
  private resolvePayload(prompt: string): { items: unknown[] } {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("test suggestions")) {
      return this.objectListMode
        ? {
            items: [
              { description: "Regression test for token refresh expiry handling." },
              {
                description: "E2E test for logout/login after profile update.",
                title: "E2E"
              },
              { description: "Contract test for cache refresh on profile save." }
            ]
          }
        : {
            items: [
              "Regression test for token refresh when refresh token expires.",
              "E2E test for logout/login after profile update.",
              "Contract test for cache refresh on profile save."
            ]
          };
    }

    if (lowerPrompt.includes("follow-up")) {
      return this.objectListMode
        ? {
            items: [
              { content: "Add follow-up issue for cache invalidation assumptions." },
              { content: "Document auth refresh rollback procedure." }
            ]
          }
        : {
            items: [
              "Add follow-up issue for cache invalidation assumptions.",
              "Document auth refresh rollback procedure."
            ]
          };
    }

    return this.objectListMode
      ? {
          items: [
            { text: "Token expiry edge case on refresh boundary." },
            { text: "Stale profile cache after logout/login." }
          ]
        }
      : {
          items: [
            "Token expiry edge case on refresh boundary.",
            "Stale profile cache after logout/login."
          ]
        };
  }
}

const BASE_INPUT: PullRequestReviewWorkflowInput = {
  pullRequestNumber: 281,
  pullRequestTitle: "Update token refresh and profile cache handling",
  repository: "acme/payments-api"
};

describe("pr-review-workflow nodes", () => {
  it("generates summary and list nodes from deterministic provider", async () => {
    const provider = new StubModelProvider();

    const summary = await generateSummaryNode(provider, BASE_INPUT);
    const risks = await generateRisksNode(provider, BASE_INPUT);
    const suggestedTests = await generateSuggestedTestsNode(provider, BASE_INPUT);
    const followUpTasks = await generateFollowUpTasksNode(provider, BASE_INPUT);

    expect(summary.summary).toContain("auth refresh");
    expect(risks.risks[0]).toContain("Token expiry");
    expect(suggestedTests.suggestedTests[0]).toContain("Regression test");
    expect(followUpTasks.followUpTasks[0]).toContain("follow-up issue");
  });

  it("normalizes object list items returned by provider", async () => {
    const provider = new StubModelProvider(true);

    const risks = await generateRisksNode(provider, BASE_INPUT);
    const suggestedTests = await generateSuggestedTestsNode(provider, BASE_INPUT);
    const followUpTasks = await generateFollowUpTasksNode(provider, BASE_INPUT);

    expect(risks.risks[0]).toContain("Token expiry");
    expect(suggestedTests.suggestedTests[0]).toContain("Regression test");
    expect(followUpTasks.followUpTasks[0]).toContain("follow-up issue");
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
});
