import { createServer, type Server } from "node:http";

import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { startStandaloneServer } from "@apollo/server/standalone";
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type {
  StartPullRequestReviewInput,
  WorkflowRun
} from "@patchloom/core";
import cors from "cors";
import express from "express";
import { withFilter } from "graphql-subscriptions";
import type { GraphQLSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";

import {
  InMemoryRunStore,
  type RunUpdatedEvent
} from "./workflow/run-store";

interface Disposable {
  dispose: () => void | Promise<void>;
}

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

  type Subscription {
    runUpdated(runId: ID!): WorkflowRun!
  }
`;

/**
 * Creates executable GraphQL schema for HTTP and subscription transports.
 *
 * @param appVersion - Service version string returned by health query.
 * @param runStore - Run store implementation used by workflow resolvers.
 * @returns Executable GraphQL schema.
 */
export function createGraphQLSchema(
  appVersion: string,
  runStore: InMemoryRunStore
): GraphQLSchema {
  return makeExecutableSchema({
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
      },
      Subscription: {
        runUpdated: {
          resolve: (payload: RunUpdatedEvent): WorkflowRun => payload.runUpdated,
          subscribe: withFilter(
            (
              _: unknown,
              __: unknown,
              context?: GraphQLContext
            ) => (context?.runStore ?? runStore).subscribeRunUpdates(),
            (payload: unknown, args: unknown) => {
              if (
                typeof payload !== "object" ||
                payload === null ||
                !("runUpdated" in payload) ||
                typeof args !== "object" ||
                args === null ||
                !("runId" in args)
              ) {
                return false;
              }

              return (
                (payload as RunUpdatedEvent).runUpdated.id ===
                String((args as { runId: unknown }).runId)
              );
            }
          )
        }
      }
    },
    typeDefs
  });
}

/**
 * Creates a configured GraphQL Apollo server instance.
 *
 * @param appVersion - Service version string returned by health query.
 * @param runStore - Run store implementation used by workflow resolvers.
 * @param httpServer - Optional HTTP server for graceful draining.
 * @param wsServerCleanup - Optional WebSocket cleanup hook.
 * @returns Apollo server instance.
 */
export function createGraphQLServer(
  appVersion: string,
  runStore: InMemoryRunStore = new InMemoryRunStore(),
  httpServer?: Server,
  wsServerCleanup?: Disposable
): ApolloServer<GraphQLContext> {
  const plugins = [];

  if (httpServer) {
    plugins.push(ApolloServerPluginDrainHttpServer({ httpServer }));
  }

  if (wsServerCleanup) {
    plugins.push({
      async serverWillStart() {
        return {
          async drainServer() {
            await wsServerCleanup.dispose();
          }
        };
      }
    });
  }

  return new ApolloServer<GraphQLContext>({
    plugins,
    schema: createGraphQLSchema(appVersion, runStore)
  });
}

/**
 * Starts the standalone GraphQL HTTP server.
 *
 * @param port - Port where the server should listen.
 * @param appVersion - Service version string for health query.
 * @returns Running server URL and subscription URL.
 */
export async function startApiServer(
  port: number,
  appVersion: string
): Promise<{ subscriptionUrl: string; url: string }> {
  const runStore = new InMemoryRunStore();
  const app = express();
  const httpServer = createServer(app);
  const subscriptionSchema = createGraphQLSchema(appVersion, runStore);
  const wsServer = new WebSocketServer({
    path: "/graphql",
    server: httpServer
  });

  const wsServerCleanup = useServer(
    {
      context: async (ctx): Promise<GraphQLContext> => ({
        requestId: ctx.extra.request.headers["x-request-id"]?.toString() ?? "unknown",
        runStore
      }),
      schema: subscriptionSchema
    },
    wsServer
  );

  const server = createGraphQLServer(
    appVersion,
    runStore,
    httpServer,
    wsServerCleanup
  );

  await server.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<GraphQLContext> => ({
        requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
        runStore
      })
    })
  );

  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, () => resolve());
  });

  return {
    subscriptionUrl: `ws://localhost:${port}/graphql`,
    url: `http://localhost:${port}/graphql`
  };
}

/**
 * Maintains compatibility with tests that use in-memory execution only.
 *
 * @param appVersion - Service version string for health query.
 * @returns Standalone server URL.
 */
export async function startStandaloneApiServer(appVersion: string): Promise<{
  url: string;
}> {
  const runStore = new InMemoryRunStore();
  const server = createGraphQLServer(appVersion, runStore);

  const started = await startStandaloneServer(server, {
    context: async ({ req }): Promise<GraphQLContext> => ({
      requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
      runStore
    }),
    listen: {
      port: 0
    }
  });

  return { url: started.url };
}
