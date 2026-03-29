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

import { typeDefs } from "./graphql/type-defs";
import {
  createGitHubPullRequestReader,
  type CreateGitHubPullRequestReaderOptions,
  type GitHubPullRequestReader
} from "./integrations/github-reader";
import { registerGitHubWebhookRoute } from "./integrations/github-webhook-route";
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
  githubPullRequestReader: GitHubPullRequestReader | null;
  requestId: string;
  runStore: InMemoryRunStore;
}

/**
 * Creates executable GraphQL schema for HTTP and subscription transports.
 *
 * @param appVersion - Service version string returned by health query.
 * @param runStore - Run store implementation used by workflow resolvers.
 * @param githubPullRequestReader - GitHub reader for PR URL triggered workflow runs.
 * @returns Executable GraphQL schema.
 */
export function createGraphQLSchema(
  appVersion: string,
  runStore: InMemoryRunStore,
  githubPullRequestReader: GitHubPullRequestReader | null = null
): GraphQLSchema {
  return makeExecutableSchema({
    resolvers: {
      Mutation: {
        startPullRequestReview: (
          _: unknown,
          args: { input: StartPullRequestReviewInput },
          context: GraphQLContext
        ): WorkflowRun =>
          (context.runStore ?? runStore).startPullRequestReview(args.input),
        startPullRequestReviewFromUrl: async (
          _: unknown,
          args: { input: { pullRequestUrl: string } },
          context: GraphQLContext
        ): Promise<WorkflowRun> => {
          const reader =
            context.githubPullRequestReader ?? githubPullRequestReader;

          if (!reader) {
            throw new Error(
              "GitHub token integration is not configured. Set GITHUB_TOKEN."
            );
          }

          const details = await reader.fetchPullRequestByUrl(
            args.input.pullRequestUrl
          );

          return (context.runStore ?? runStore).startPullRequestReview({
            pullRequestNumber: details.pullRequestNumber,
            pullRequestTitle: details.pullRequestTitle,
            repository: details.repository
          });
        }
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
 * @param githubPullRequestReader - GitHub reader for PR URL triggered workflow runs.
 * @returns Apollo server instance.
 */
export function createGraphQLServer(
  appVersion: string,
  runStore: InMemoryRunStore = new InMemoryRunStore(),
  httpServer?: Server,
  wsServerCleanup?: Disposable,
  githubPullRequestReader: GitHubPullRequestReader | null = null
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
    schema: createGraphQLSchema(appVersion, runStore, githubPullRequestReader)
  });
}

/**
 * Starts the standalone GraphQL HTTP server.
 *
 * @param port - Port where the server should listen.
 * @param appVersion - Service version string for health query.
 * @param githubOptions - Optional GitHub integration options.
 * @returns Running server URL and subscription URL.
 */
export async function startApiServer(
  port: number,
  appVersion: string,
  githubOptions: CreateGitHubPullRequestReaderOptions = {}
): Promise<{ subscriptionUrl: string; url: string }> {
  const runStore = new InMemoryRunStore();
  const githubPullRequestReader = createGitHubPullRequestReader(githubOptions);
  const app = express();
  const httpServer = createServer(app);
  const subscriptionSchema = createGraphQLSchema(
    appVersion,
    runStore,
    githubPullRequestReader
  );
  const wsServer = new WebSocketServer({
    path: "/graphql",
    server: httpServer
  });

  const wsServerCleanup = useServer(
    {
      context: async (ctx): Promise<GraphQLContext> => ({
        githubPullRequestReader,
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
    wsServerCleanup,
    githubPullRequestReader
  );

  await server.start();

  registerGitHubWebhookRoute(app, {
    runStore,
    webhookSecret: githubOptions.githubWebhookSecret
  });

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<GraphQLContext> => ({
        githubPullRequestReader,
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
  const server = createGraphQLServer(
    appVersion,
    runStore,
    undefined,
    undefined,
    null
  );

  const started = await startStandaloneServer(server, {
    context: async ({ req }): Promise<GraphQLContext> => ({
      githubPullRequestReader: null,
      requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
      runStore
    }),
    listen: {
      port: 0
    }
  });

  return { url: started.url };
}
