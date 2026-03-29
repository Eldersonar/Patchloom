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

  input StartPullRequestReviewInput {
    pullRequestNumber: Int!
    pullRequestTitle: String!
    repository: String!
  }

  input StartPullRequestReviewFromUrlInput {
    pullRequestUrl: String!
  }

  type Query {
    getRun(id: ID!): WorkflowRun
    health: Health!
    listRuns: [WorkflowRun!]!
  }

  type Mutation {
    startPullRequestReview(input: StartPullRequestReviewInput!): WorkflowRun!
    startPullRequestReviewFromUrl(input: StartPullRequestReviewFromUrlInput!): WorkflowRun!
  }

  type Subscription {
    runUpdated(runId: ID!): WorkflowRun!
  }
`;
