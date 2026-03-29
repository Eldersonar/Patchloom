import type {
  ModelProvider,
  StructuredGenerationResult,
  TextGenerationResult
} from "../model-provider";
import {
  LIST_OUTPUT_SCHEMA,
  buildFollowUpPrompt,
  buildRisksPrompt,
  buildSuggestedTestsPrompt,
  buildSummaryPrompt,
  invokeWithRetries,
  normalizeConfidence
} from "./pr-review-workflow-helpers";
import {
  refineGeneratedItems,
  refineSummary
} from "./pr-review-normalization";

export interface PullRequestReviewWorkflowInput {
  changedFiles?: string[];
  pullRequestBody?: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  repository: string;
}

export interface PullRequestReviewOutput {
  confidence: number;
  followUpTasks: string[];
  promptVersion: string;
  risks: string[];
  suggestedTests: string[];
  summary: string;
  workflowVersion: string;
}

export interface PullRequestReviewArtifacts {
  normalizedOutput: Omit<PullRequestReviewOutput, "promptVersion" | "workflowVersion">;
  rawModelResponses: {
    followUpTasks: string;
    risks: string;
    suggestedTests: string;
    summary: string;
  };
}

export interface PullRequestReviewWorkflowResult {
  artifacts: PullRequestReviewArtifacts;
  output: PullRequestReviewOutput;
}

export interface PullRequestReviewWorkflowOptions {
  input: PullRequestReviewWorkflowInput;
  maxRetries?: number;
  promptVersion?: string;
  provider: ModelProvider;
  temperature?: number;
  workflowVersion?: string;
}

/**
 * Generates a PR summary node output.
 *
 * @param provider - Model provider implementation.
 * @param input - Pull request input.
 * @param temperature - Optional model temperature.
 * @returns Raw and normalized summary values.
 */
export async function generateSummaryNode(
  provider: ModelProvider,
  input: PullRequestReviewWorkflowInput,
  temperature?: number
): Promise<{ raw: TextGenerationResult; summary: string }> {
  const raw = await provider.generateText({
    prompt: buildSummaryPrompt(input),
    temperature
  });

  return {
    raw,
    summary: refineSummary(raw.text)
  };
}

/**
 * Generates risk candidates for a pull request.
 *
 * @param provider - Model provider implementation.
 * @param input - Pull request input.
 * @param temperature - Optional model temperature.
 * @returns Raw and normalized risk list.
 */
export async function generateRisksNode(
  provider: ModelProvider,
  input: PullRequestReviewWorkflowInput,
  temperature?: number
): Promise<{ raw: StructuredGenerationResult<{ items: string[] }>; risks: string[] }> {
  const raw = await provider.generateStructured({
    prompt: buildRisksPrompt(input),
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    raw,
    risks: refineGeneratedItems(raw.data.items, {
      maxItems: 4,
      maxLength: 180
    })
  };
}

/**
 * Generates suggested tests for the pull request.
 *
 * @param provider - Model provider implementation.
 * @param input - Pull request input.
 * @param temperature - Optional model temperature.
 * @returns Raw and normalized suggested test list.
 */
export async function generateSuggestedTestsNode(
  provider: ModelProvider,
  input: PullRequestReviewWorkflowInput,
  temperature?: number
): Promise<{
  raw: StructuredGenerationResult<{ items: string[] }>;
  suggestedTests: string[];
}> {
  const raw = await provider.generateStructured({
    prompt: buildSuggestedTestsPrompt(input),
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    raw,
    suggestedTests: refineGeneratedItems(raw.data.items, {
      maxItems: 5,
      maxLength: 180
    })
  };
}

/**
 * Generates follow-up engineering tasks.
 *
 * @param provider - Model provider implementation.
 * @param input - Pull request input.
 * @param temperature - Optional model temperature.
 * @returns Raw and normalized follow-up task list.
 */
export async function generateFollowUpTasksNode(
  provider: ModelProvider,
  input: PullRequestReviewWorkflowInput,
  temperature?: number
): Promise<{
  followUpTasks: string[];
  raw: StructuredGenerationResult<{ items: string[] }>;
}> {
  const raw = await provider.generateStructured({
    prompt: buildFollowUpPrompt(input),
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    followUpTasks: refineGeneratedItems(raw.data.items, {
      maxItems: 3,
      maxLength: 180
    }),
    raw
  };
}

/**
 * Calculates deterministic confidence for PR review output.
 *
 * @param input - Normalized workflow output fields.
 * @returns Normalized confidence between 0 and 1.
 */
export function calculateConfidence(input: {
  followUpTasks: string[];
  risks: string[];
  suggestedTests: string[];
  summary: string;
}): number {
  let score = 0.3;

  score += Math.min(input.risks.length, 4) * 0.08;
  score += Math.min(input.suggestedTests.length, 5) * 0.05;
  score += Math.min(input.followUpTasks.length, 3) * 0.04;

  if (input.summary.trim().length >= 80) {
    score += 0.08;
  }

  return normalizeConfidence(Math.min(score, 0.9));
}

/**
 * Executes the pull request review workflow in deterministic node order.
 *
 * @param options - Workflow execution options.
 * @returns Output and artifacts from the workflow run.
 */
export async function runPullRequestReviewWorkflow(
  options: PullRequestReviewWorkflowOptions
): Promise<PullRequestReviewWorkflowResult> {
  const promptVersion = options.promptVersion ?? "pr-review-prompts/v1";
  const workflowVersion = options.workflowVersion ?? "pr-review-workflow/v1";
  const maxRetries = options.maxRetries ?? 1;

  const summaryNode = await invokeWithRetries(
    () =>
      generateSummaryNode(options.provider, options.input, options.temperature),
    maxRetries
  );
  const risksNode = await invokeWithRetries(
    () => generateRisksNode(options.provider, options.input, options.temperature),
    maxRetries
  );
  const testsNode = await invokeWithRetries(
    () =>
      generateSuggestedTestsNode(options.provider, options.input, options.temperature),
    maxRetries
  );
  const followUpNode = await invokeWithRetries(
    () =>
      generateFollowUpTasksNode(options.provider, options.input, options.temperature),
    maxRetries
  );

  const normalizedOutput = {
    confidence: calculateConfidence({
      followUpTasks: followUpNode.followUpTasks,
      risks: risksNode.risks,
      suggestedTests: testsNode.suggestedTests,
      summary: summaryNode.summary
    }),
    followUpTasks: followUpNode.followUpTasks,
    risks: risksNode.risks,
    suggestedTests: testsNode.suggestedTests,
    summary: summaryNode.summary
  };

  return {
    artifacts: {
      normalizedOutput,
      rawModelResponses: {
        followUpTasks: followUpNode.raw.text,
        risks: risksNode.raw.text,
        suggestedTests: testsNode.raw.text,
        summary: summaryNode.raw.text
      }
    },
    output: {
      ...normalizedOutput,
      promptVersion,
      workflowVersion
    }
  };
}
