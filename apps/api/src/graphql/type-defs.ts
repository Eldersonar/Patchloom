export const typeDefs = `#graphql
  type Health {
    status: String!
    version: String!
  }

  type Suggestion {
    content: String!
    createdAt: String!
    id: ID!
    kind: String!
  }

  type WorkflowRun {
    confidence: Float!
    createdAt: String!
    followUpTasks: [String!]!
    id: ID!
    promptVersion: String!
    pullRequestNumber: Int!
    repository: String!
    risks: [String!]!
    status: String!
    suggestedTests: [String!]!
    suggestions: [Suggestion!]!
    summary: String!
    updatedAt: String!
    workflowType: String!
    workflowVersion: String!
  }

  type ApprovalDecision {
    actor: String!
    createdAt: String!
    decision: String!
    id: ID!
    runId: ID!
    suggestionId: ID!
  }

  type CommentPublication {
    body: String!
    commentId: String!
    createdAt: String!
    id: ID!
    idempotencyKey: String!
    publishedUrl: String!
    runId: ID!
    target: String!
  }

  input StartPullRequestReviewInput {
    pullRequestNumber: Int!
    pullRequestTitle: String!
    repository: String!
  }

  input StartPullRequestReviewFromUrlInput {
    pullRequestUrl: String!
  }

  input ApproveSuggestionInput {
    actor: String!
    decision: String!
    runId: ID!
    suggestionId: ID!
  }

  input PublishCommentInput {
    body: String!
    idempotencyKey: String!
    runId: ID!
    target: String!
  }

  type Query {
    getRun(id: ID!): WorkflowRun
    health: Health!
    listApprovalDecisions(runId: ID!): [ApprovalDecision!]!
    listCommentPublications(runId: ID!): [CommentPublication!]!
    listRuns: [WorkflowRun!]!
  }

  type Mutation {
    approveSuggestion(input: ApproveSuggestionInput!): ApprovalDecision!
    publishComment(input: PublishCommentInput!): CommentPublication!
    startPullRequestReview(input: StartPullRequestReviewInput!): WorkflowRun!
    startPullRequestReviewFromUrl(input: StartPullRequestReviewFromUrlInput!): WorkflowRun!
  }

  type Subscription {
    runUpdated(runId: ID!): WorkflowRun!
  }
`;
