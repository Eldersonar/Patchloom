import { RunnableLambda } from "@langchain/core/runnables";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  calculateConfidence,
  generateFollowUpTasksNode,
  generateRisksNode,
  generateSuggestedTestsNode,
  generateSummaryNode,
  type PullRequestReviewWorkflowOptions,
  type PullRequestReviewWorkflowResult
} from "./pr-review-workflow";
import {
  classifyPullRequestType,
  invokeWithRetries,
  type PullRequestType
} from "./pr-review-workflow-helpers";

interface PullRequestGenerationPolicy {
  maxFollowUpTasks: number;
  maxFollowUpTaskLength: number;
  maxRiskLength: number;
  maxRisks: number;
  maxSuggestedTests: number;
  maxTestLength: number;
}

const PullRequestReviewLangGraphState = Annotation.Root({
  confidence: createReplaceAnnotation(() => 0),
  followUpTasks: createReplaceAnnotation(() => [] as string[]),
  rawFollowUpTasksResponse: createReplaceAnnotation(() => ""),
  rawRisksResponse: createReplaceAnnotation(() => ""),
  rawSuggestedTestsResponse: createReplaceAnnotation(() => ""),
  rawSummaryResponse: createReplaceAnnotation(() => ""),
  risks: createReplaceAnnotation(() => [] as string[]),
  suggestedTests: createReplaceAnnotation(() => [] as string[]),
  summary: createReplaceAnnotation(() => "")
});

type PullRequestReviewLangGraphStateValue =
  typeof PullRequestReviewLangGraphState.State;

/**
 * Runs the PR review workflow using LangGraph stateful orchestration.
 *
 * @param options - Workflow execution options.
 * @returns Output and artifacts from the workflow run.
 */
export async function runPullRequestReviewLangGraphWorkflow(
  options: PullRequestReviewWorkflowOptions
): Promise<PullRequestReviewWorkflowResult> {
  const promptVersion = options.promptVersion ?? "pr-review-prompts/v1";
  const workflowVersion = options.workflowVersion ?? "pr-review-workflow/v1";
  const maxRetries = options.maxRetries ?? 1;
  const pullRequestType = classifyPullRequestType(options.input);
  const policy = getGenerationPolicyByPullRequestType(pullRequestType);

  const summaryNode = RunnableLambda.from(
    async (): Promise<Partial<PullRequestReviewLangGraphStateValue>> => {
      const result = await invokeWithRetries(
        () =>
          generateSummaryNode(options.provider, options.input, options.temperature),
        maxRetries
      );

      return {
        rawSummaryResponse: result.raw.text,
        summary: result.summary
      };
    }
  );

  const risksNode = RunnableLambda.from(
    async (): Promise<Partial<PullRequestReviewLangGraphStateValue>> => {
      const result = await invokeWithRetries(
        () =>
          generateRisksNode(
            options.provider,
            options.input,
            options.temperature,
            policy.maxRisks,
            policy.maxRiskLength
          ),
        maxRetries
      );

      return {
        rawRisksResponse: result.raw.text,
        risks: result.risks
      };
    }
  );

  const suggestedTestsNode = RunnableLambda.from(
    async (): Promise<Partial<PullRequestReviewLangGraphStateValue>> => {
      const result = await invokeWithRetries(
        () =>
          generateSuggestedTestsNode(
            options.provider,
            options.input,
            options.temperature,
            policy.maxSuggestedTests,
            policy.maxTestLength
          ),
        maxRetries
      );

      return {
        rawSuggestedTestsResponse: result.raw.text,
        suggestedTests: result.suggestedTests
      };
    }
  );

  const followUpTasksNode = RunnableLambda.from(
    async (): Promise<Partial<PullRequestReviewLangGraphStateValue>> => {
      const result = await invokeWithRetries(
        () =>
          generateFollowUpTasksNode(
            options.provider,
            options.input,
            options.temperature,
            policy.maxFollowUpTasks,
            policy.maxFollowUpTaskLength
          ),
        maxRetries
      );

      return {
        followUpTasks: result.followUpTasks,
        rawFollowUpTasksResponse: result.raw.text
      };
    }
  );

  const finalizeNode = RunnableLambda.from(
    async (
      state: PullRequestReviewLangGraphStateValue
    ): Promise<Partial<PullRequestReviewLangGraphStateValue>> => ({
      confidence: calculateConfidence({
        followUpTasks: state.followUpTasks,
        risks: state.risks,
        suggestedTests: state.suggestedTests,
        summary: state.summary
      })
    })
  );

  const graph = new StateGraph(PullRequestReviewLangGraphState)
    .addNode("summary_step", summaryNode)
    .addNode("risks_step", risksNode)
    .addNode("suggested_tests_step", suggestedTestsNode)
    .addNode("follow_up_tasks_step", followUpTasksNode)
    .addNode("finalize_step", finalizeNode)
    .addEdge(START, "summary_step")
    .addEdge("summary_step", "risks_step")
    .addEdge("risks_step", "suggested_tests_step")
    .addEdge("suggested_tests_step", "follow_up_tasks_step")
    .addEdge("follow_up_tasks_step", "finalize_step")
    .addEdge("finalize_step", END)
    .compile();

  const state = await graph.invoke({});

  const normalizedOutput = {
    confidence: state.confidence,
    followUpTasks: state.followUpTasks,
    risks: state.risks,
    suggestedTests: state.suggestedTests,
    summary: state.summary
  };

  return {
    artifacts: {
      normalizedOutput,
      rawModelResponses: {
        followUpTasks: state.rawFollowUpTasksResponse,
        risks: state.rawRisksResponse,
        suggestedTests: state.rawSuggestedTestsResponse,
        summary: state.rawSummaryResponse
      }
    },
    output: {
      ...normalizedOutput,
      promptVersion,
      workflowVersion
    }
  };
}

/**
 * Creates a state channel that replaces prior values and defines a default.
 *
 * @param defaultValue - Default value factory.
 * @returns Reducer annotation for LangGraph state.
 */
function createReplaceAnnotation<T>(defaultValue: () => T) {
  return Annotation<T>({
    default: defaultValue,
    reducer: (_, next) => next
  });
}

/**
 * Maps pull request type to generation limits.
 *
 * @param pullRequestType - Classified pull request type.
 * @returns Generation policy for risk/test/follow-up caps.
 */
function getGenerationPolicyByPullRequestType(
  pullRequestType: PullRequestType
): PullRequestGenerationPolicy {
  if (pullRequestType === "scaffold") {
    return {
      maxFollowUpTasks: 2,
      maxFollowUpTaskLength: 170,
      maxRiskLength: 170,
      maxRisks: 3,
      maxSuggestedTests: 4,
      maxTestLength: 170
    };
  }

  if (pullRequestType === "bugfix") {
    return {
      maxFollowUpTasks: 2,
      maxFollowUpTaskLength: 180,
      maxRiskLength: 180,
      maxRisks: 4,
      maxSuggestedTests: 5,
      maxTestLength: 180
    };
  }

  return {
    maxFollowUpTasks: 3,
    maxFollowUpTaskLength: 180,
    maxRiskLength: 180,
    maxRisks: 4,
    maxSuggestedTests: 5,
    maxTestLength: 180
  };
}
