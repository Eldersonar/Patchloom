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
  temperature?: number,
  maxItems = 4,
  maxLength = 180
): Promise<{ raw: StructuredGenerationResult<{ items: string[] }>; risks: string[] }> {
  const raw = await provider.generateStructured({
    prompt: buildRisksPrompt(input),
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    raw,
    risks: refineGeneratedItems(raw.data.items, {
      maxItems,
      maxLength
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
  temperature?: number,
  maxItems = 5,
  maxLength = 180
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
      maxItems,
      maxLength
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
  temperature?: number,
  maxItems = 3,
  maxLength = 180
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
      maxItems,
      maxLength
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
