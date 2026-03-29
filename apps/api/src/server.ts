import { createServer, type Server } from "node:http";

import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { startStandaloneServer } from "@apollo/server/standalone";
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import cors from "cors";
import express from "express";
import type { GraphQLSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";

import { createResolvers, type GraphQLContext } from "./graphql/resolvers";
import { typeDefs } from "./graphql/type-defs";
import {
  createGitHubCommentPublisher,
  createGitHubPullRequestReader,
  type CreateGitHubPullRequestReaderOptions,
  type GitHubPullRequestReader
} from "./integrations/github-reader";
import { registerGitHubWebhookRoute } from "./integrations/github-webhook-route";
import { seedDemoRuns } from "./workflow/demo-mode";
import { InMemoryRunStore } from "./workflow/run-store";
import {
  createDeterministicWorkflowExecutor,
  createModelWorkflowExecutor
} from "./workflow/default-workflow-executor";
import { InMemoryReviewGovernanceStore } from "./workflow/review-governance-store";

interface Disposable {
  dispose: () => void | Promise<void>;
}

export interface StartApiServerOptions extends CreateGitHubPullRequestReaderOptions {
  demoMode?: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  modelProvider?: "gemini" | "openai" | "anthropic";
}

/**
 * Creates executable GraphQL schema for HTTP and subscription transports.
 *
 * @param appVersion - Service version string returned by health query.
 * @param runStore - Run store implementation used by workflow resolvers.
 * @param githubPullRequestReader - GitHub reader for PR URL triggered workflow runs.
 * @param reviewGovernanceStore - In-memory suggestion governance store.
 * @returns Executable GraphQL schema.
 */
export function createGraphQLSchema(
  appVersion: string,
  runStore: InMemoryRunStore,
  githubPullRequestReader: GitHubPullRequestReader | null = null,
  reviewGovernanceStore: InMemoryReviewGovernanceStore =
    new InMemoryReviewGovernanceStore()
): GraphQLSchema {
  return makeExecutableSchema({
    resolvers: createResolvers({
      appVersion,
      githubPullRequestReader,
      reviewGovernanceStore,
      runStore
    }),
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
 * @param reviewGovernanceStore - In-memory suggestion governance store.
 * @returns Apollo server instance.
 */
export function createGraphQLServer(
  appVersion: string,
  runStore: InMemoryRunStore = new InMemoryRunStore(),
  httpServer?: Server,
  wsServerCleanup?: Disposable,
  githubPullRequestReader: GitHubPullRequestReader | null = null,
  reviewGovernanceStore: InMemoryReviewGovernanceStore =
    new InMemoryReviewGovernanceStore()
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
    schema: createGraphQLSchema(
      appVersion,
      runStore,
      githubPullRequestReader,
      reviewGovernanceStore
    )
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
  options: StartApiServerOptions = {}
): Promise<{ subscriptionUrl: string; url: string }> {
  const runStore = new InMemoryRunStore({
    workflowExecutor: options.demoMode
      ? createDeterministicWorkflowExecutor()
      : createModelWorkflowExecutor({
          geminiApiKey: options.geminiApiKey,
          geminiModel: options.geminiModel,
          modelProvider: options.modelProvider ?? "gemini"
        })
  });
  const githubCommentPublisher = createGitHubCommentPublisher(options);
  const reviewGovernanceStore = new InMemoryReviewGovernanceStore({
    commentPublisher: githubCommentPublisher
  });
  const githubPullRequestReader = createGitHubPullRequestReader(options);

  if (options.demoMode) {
    seedDemoRuns(runStore);
  }

  const app = express();
  const httpServer = createServer(app);
  const subscriptionSchema = createGraphQLSchema(
    appVersion,
    runStore,
    githubPullRequestReader,
    reviewGovernanceStore
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
        reviewGovernanceStore,
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
    githubPullRequestReader,
    reviewGovernanceStore
  );

  await server.start();

  registerGitHubWebhookRoute(app, {
    githubPullRequestReader,
    runStore,
    webhookSecret: options.githubWebhookSecret
  });

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<GraphQLContext> => ({
        githubPullRequestReader,
        requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
        reviewGovernanceStore,
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
  const reviewGovernanceStore = new InMemoryReviewGovernanceStore();
  const server = createGraphQLServer(
    appVersion,
    runStore,
    undefined,
    undefined,
    null,
    reviewGovernanceStore
  );

  const started = await startStandaloneServer(server, {
    context: async ({ req }): Promise<GraphQLContext> => ({
      githubPullRequestReader: null,
      requestId: req.headers["x-request-id"]?.toString() ?? "unknown",
      reviewGovernanceStore,
      runStore
    }),
    listen: {
      port: 0
    }
  });

  return { url: started.url };
}
