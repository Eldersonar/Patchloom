import {
  runPullRequestReviewWorkflow,
  type ModelProvider,
  type PullRequestReviewWorkflowResult,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type TextGenerationRequest,
  type TextGenerationResult
} from "@patchloom/ai";
import type { StartPullRequestReviewInput } from "@patchloom/core";

export type PullRequestReviewWorkflowExecutor = (
  input: StartPullRequestReviewInput
) => Promise<PullRequestReviewWorkflowResult>;

/**
 * Creates the default workflow executor used by the API in development mode.
 *
 * @returns Executor that runs deterministic PR-review workflow nodes.
 */
export function createDefaultWorkflowExecutor(): PullRequestReviewWorkflowExecutor {
  const provider = new DeterministicWorkflowProvider();

  return async (input) =>
    runPullRequestReviewWorkflow({
      input,
      provider
    });
}

class DeterministicWorkflowProvider implements ModelProvider {
  public async generateText(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult> {
    const prLine = extractPullRequestLine(request.prompt);

    return {
      model: request.model ?? "deterministic-dev-model",
      provider: "deterministic-dev",
      text: `${prLine} updates behavior that should be reviewed for edge cases and regression safety.`
    };
  }

  public async generateStructured<TOutput>(
    request: StructuredGenerationRequest<TOutput>
  ): Promise<StructuredGenerationResult<TOutput>> {
    const prompt = request.prompt.toLowerCase();
    const items = buildItemsForPrompt(prompt);
    const payload = { items };
    const data = request.schema.parse(payload);

    return {
      data,
      model: request.model ?? "deterministic-dev-model",
      provider: "deterministic-dev",
      text: JSON.stringify(payload)
    };
  }
}

function extractPullRequestLine(prompt: string): string {
  const match = prompt.match(/Pull request:\s*(#[^\n]+)/i);

  if (!match) {
    return "Pull request";
  }

  return `Pull request ${match[1]}`;
}

function buildItemsForPrompt(prompt: string): string[] {
  if (prompt.includes("risk")) {
    return [
      "Token expiration boundaries may cause re-authentication loops.",
      "Cache invalidation after profile updates can surface stale data.",
      "Session recovery paths could fail after logout/login race conditions."
    ];
  }

  if (prompt.includes("test suggestions")) {
    return [
      "Add regression test for refresh token expiry boundary conditions.",
      "Add integration test for profile cache refresh after update.",
      "Add e2e logout/login test covering stale session cleanup."
    ];
  }

  return [
    "Create follow-up issue for cache invalidation assumptions.",
    "Document rollback checklist for auth refresh changes."
  ];
}
