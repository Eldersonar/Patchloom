import { Client } from "pg";

export interface DatabaseClient {
  connect: () => Promise<unknown>;
  end: () => Promise<void>;
  query: (sql: string) => Promise<unknown>;
}

export interface DatabaseCheckResult {
  error?: string;
  ok: boolean;
}

export type DatabaseClientFactory = (
  connectionString: string
) => DatabaseClient;

/**
 * Creates the default PostgreSQL client factory.
 *
 * @returns Factory that instantiates pg clients.
 */
export function createPgClientFactory(): DatabaseClientFactory {
  return (connectionString) =>
    new Client({
      connectionString
    });
}

/**
 * Verifies database connectivity by opening a connection and executing SELECT 1.
 *
 * @param connectionString - Postgres connection string.
 * @param createClient - Factory for creating DB clients.
 * @returns Result indicating whether connectivity check succeeded.
 */
export async function verifyDatabaseConnection(
  connectionString: string,
  createClient: DatabaseClientFactory = createPgClientFactory()
): Promise<DatabaseCheckResult> {
  const client = createClient(connectionString);

  try {
    await client.connect();
    await client.query("SELECT 1");

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return {
      error: message,
      ok: false
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
