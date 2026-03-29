import { createHmac } from "node:crypto";
import { createServer } from "node:http";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { registerGitHubWebhookRoute } from "../../src/integrations/github-webhook-route";
import { InMemoryRunStore } from "../../src/workflow/run-store";

interface RunningWebhookServer {
  close: () => Promise<void>;
  runStore: InMemoryRunStore;
  url: string;
}

const activeServers: RunningWebhookServer[] = [];

describe("github webhook route", () => {
  afterEach(async () => {
    for (const server of activeServers.splice(0)) {
      await server.close();
      server.runStore.dispose();
    }
  });

  it("accepts valid pull_request webhook and starts a run", async () => {
    const runningServer = await startWebhookServer({
      webhookSecret: "test-secret"
    });
    const payload = JSON.stringify({
      action: "opened",
      pull_request: {
        number: 302,
        title: "Improve billing retry logic"
      },
      repository: {
        full_name: "acme/payments"
      }
    });

    const response = await postWebhook(runningServer.url, {
      body: payload,
      deliveryId: "delivery-1",
      eventName: "pull_request",
      secret: "test-secret"
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe("accepted");
    expect(runningServer.runStore.listRuns()).toHaveLength(1);
    expect(runningServer.runStore.listRuns()[0]?.repository).toBe("acme/payments");
  });

  it("rejects invalid signatures", async () => {
    const runningServer = await startWebhookServer({
      webhookSecret: "test-secret"
    });
    const payload = JSON.stringify({
      action: "opened"
    });

    const response = await fetch(`${runningServer.url}/webhooks/github`, {
      body: payload,
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-2",
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=invalid"
      },
      method: "POST"
    });

    expect(response.status).toBe(401);
    expect(runningServer.runStore.listRuns()).toHaveLength(0);
  });

  it("ignores duplicate deliveries", async () => {
    const runningServer = await startWebhookServer({
      webhookSecret: "test-secret"
    });
    const payload = JSON.stringify({
      action: "opened",
      pull_request: {
        number: 401,
        title: "Add API retries"
      },
      repository: {
        full_name: "acme/platform"
      }
    });

    const first = await postWebhook(runningServer.url, {
      body: payload,
      deliveryId: "delivery-3",
      eventName: "pull_request",
      secret: "test-secret"
    });
    const second = await postWebhook(runningServer.url, {
      body: payload,
      deliveryId: "delivery-3",
      eventName: "pull_request",
      secret: "test-secret"
    });
    const secondBody = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(secondBody.status).toBe("duplicate_ignored");
    expect(runningServer.runStore.listRuns()).toHaveLength(1);
  });
});

async function startWebhookServer(options: {
  webhookSecret?: string;
}): Promise<RunningWebhookServer> {
  const app = express();
  const runStore = new InMemoryRunStore({ autoProgress: false });
  registerGitHubWebhookRoute(app, {
    runStore,
    webhookSecret: options.webhookSecret
  });

  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  const runningServer: RunningWebhookServer = {
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    runStore,
    url: `http://127.0.0.1:${address.port}`
  };

  activeServers.push(runningServer);
  return runningServer;
}

async function postWebhook(
  baseUrl: string,
  options: {
    body: string;
    deliveryId: string;
    eventName: string;
    secret: string;
  }
): Promise<Response> {
  const signature = createGitHubSignature(options.body, options.secret);

  return fetch(`${baseUrl}/webhooks/github`, {
    body: options.body,
    headers: {
      "content-type": "application/json",
      "x-github-delivery": options.deliveryId,
      "x-github-event": options.eventName,
      "x-hub-signature-256": signature
    },
    method: "POST"
  });
}

function createGitHubSignature(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}
