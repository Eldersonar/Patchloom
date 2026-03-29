import { z } from "zod";

import type {
  ModelProvider,
  StructuredGenerationResult,
  TextGenerationResult
} from "../model-provider";

const LIST_OUTPUT_SCHEMA = z.object({
  items: z.array(z.string().min(1)).min(1).max(10)
});

export interface PullRequestReviewWorkflowInput {
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
  const prompt = [
    "You are reviewing a software pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return a concise summary in 2-3 sentences."
  ].join("\n");

  const raw = await provider.generateText({
    prompt,
    temperature
  });

  return {
    raw,
    summary: raw.text.trim()
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
  const prompt = [
    "You are reviewing pull request risk areas.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` as a list of 3-5 concrete risk areas."
  ].join("\n");

  const raw = await provider.generateStructured({
    prompt,
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    raw,
    risks: raw.data.items
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
  const prompt = [
    "You are generating software test suggestions for a pull request.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` as 3-6 practical regression tests."
  ].join("\n");

  const raw = await provider.generateStructured({
    prompt,
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    raw,
    suggestedTests: raw.data.items
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
  const prompt = [
    "You are proposing follow-up software engineering tasks.",
    `Repository: ${input.repository}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    "Return JSON with key `items` for 2-4 follow-up tasks."
  ].join("\n");

  const raw = await provider.generateStructured({
    prompt,
    schema: LIST_OUTPUT_SCHEMA,
    temperature
  });

  return {
    followUpTasks: raw.data.items,
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
  let score = 0.35;

  score += Math.min(input.risks.length, 5) * 0.08;
  score += Math.min(input.suggestedTests.length, 6) * 0.05;
  score += Math.min(input.followUpTasks.length, 4) * 0.04;

  if (input.summary.trim().length >= 80) {
    score += 0.08;
  }

  return normalizeConfidence(score);
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

async function invokeWithRetries<T>(
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
    }
  }
}

function normalizeConfidence(score: number): number {
  if (score < 0) {
    return 0;
  }

  if (score > 1) {
    return 1;
  }

  return Math.round(score * 100) / 100;
}
