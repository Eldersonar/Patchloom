import { loadEnvironment } from "@patchloom/config";

import { startApiServer } from "./server";

/**
 * Boots the API service with validated runtime configuration.
 *
 * @returns Promise resolved when server is started.
 */
export async function bootstrap(): Promise<void> {
  const env = loadEnvironment();
  const started = await startApiServer(env.PORT, env.APP_VERSION);

  console.log(`API running at ${started.url}`);
  console.log(`Subscriptions running at ${started.subscriptionUrl}`);
}

bootstrap().catch((error) => {
  console.error("API failed to start", error);
  process.exit(1);
});
