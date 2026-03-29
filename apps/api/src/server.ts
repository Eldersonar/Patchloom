import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

export interface HealthResponse {
  status: string;
  version: string;
}

export interface GraphQLContext {
  requestId: string;
}

const typeDefs = `#graphql
  type Health {
    status: String!
    version: String!
  }

  type Query {
    health: Health!
  }
`;

/**
 * Creates a configured GraphQL Apollo server instance.
 *
 * @param appVersion - Service version string returned by health query.
 * @returns Apollo server instance.
 */
export function createGraphQLServer(appVersion: string): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({
    resolvers: {
      Query: {
        health: (): HealthResponse => ({
          status: "ok",
          version: appVersion
        })
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
  const server = createGraphQLServer(appVersion);

  const started = await startStandaloneServer(server, {
    context: async ({ req }): Promise<GraphQLContext> => ({
      requestId: req.headers["x-request-id"]?.toString() ?? "unknown"
    }),
    listen: {
      port
    }
  });

  return { url: started.url };
}
