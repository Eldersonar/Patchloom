import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

import type { StartPullRequestReviewInput, WorkflowRun } from "@patchloom/core";

import { InMemoryRunStore } from "./workflow/run-store";

export interface HealthResponse {
  status: string;
  version: string;
}

export interface GraphQLContext {
  requestId: string;
  runStore: InMemoryRunStore;
}

const typeDefs = `#graphql
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
    createdAt: String!
    id: ID!
    pullRequestNumber: Int!
    repository: String!
    status: String!
    suggestions: [Suggestion!]!
    summary: String!
    updatedAt: String!
    workflowType: String!
  }

  input StartPullRequestReviewInput {
    pullRequestNumber: Int!
    pullRequestTitle: String!
    repository: String!
  }

  type Query {
    getRun(id: ID!): WorkflowRun
    health: Health!
    listRuns: [WorkflowRun!]!
  }

  type Mutation {
    startPullRequestReview(input: StartPullRequestReviewInput!): WorkflowRun!
  }
`;

/**
 * Creates a configured GraphQL Apollo server instance.
 *
 * @param appVersion - Service version string returned by health query.
 * @param runStore - Run store implementation used by workflow resolvers.
 * @returns Apollo server instance.
 */
export function createGraphQLServer(
  appVersion: string,
  runStore: InMemoryRunStore = new InMemoryRunStore()
): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({
    resolvers: {
      Mutation: {
        startPullRequestReview: (
          _: unknown,
          args: { input: StartPullRequestReviewInput },
          context: GraphQLContext
        ): WorkflowRun =>
          (context.runStore ?? runStore).startPullRequestReview(args.input)
      },
      Query: {
        getRun: (
          _: unknown,
          args: { id: string },
          context: GraphQLContext
        ): WorkflowRun | null => (context.runStore ?? runStore).getRun(args.id),
        health: (): HealthResponse => ({
          status: "ok",
          version: appVersion
        }),
        listRuns: (_: unknown, __: unknown, context: GraphQLContext): WorkflowRun[] =>
          (context.runStore ?? runStore).listRuns()
      }
    },
    typeDefs
  });
}

/**
 * Starts the standalone GraphQL HTTP server.
 *
 * @param port - Port where the server should listen.
 * @param appVersion - Service version string for health query.
 * @returns Running server URL.
 */
export async function startApiServer(
  port: number,
  appVersion: string
): Promise<{ url: string }> {
  const runStore = new InMemoryRunStore();
  const server = createGraphQLServer(appVersion, runStore);

  const started = await startStandaloneServer(server, {
    context: async ({ req }): Promise<GraphQLContext> => ({
      requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
      runStore
    }),
    listen: {
      port
    }
  });

  return { url: started.url };
}
