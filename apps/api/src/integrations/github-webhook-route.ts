import type { Express } from "express";
import express from "express";
import {
  type GitHubIssueWebhookPayload,
  type GitHubPullRequestWebhookPayload,
  normalizeGitHubWebhookEvent,
  verifyGitHubWebhookSignature
} from "@patchloom/integrations-github";

import type { InMemoryRunStore } from "../workflow/run-store";

export interface RegisterGitHubWebhookRouteOptions {
  runStore: InMemoryRunStore;
  webhookSecret?: string;
}

/**
 * Registers GitHub webhook route with signature verification and duplicate-delivery handling.
 *
 * @param app - Express application instance.
 * @param options - Webhook route options.
 */
export function registerGitHubWebhookRoute(
  app: Express,
  options: RegisterGitHubWebhookRouteOptions
): void {
  const seenDeliveryIds = new Set<string>();

  app.post(
    "/webhooks/github",
    express.raw({ type: "application/json" }),
    (request, response) => {
      if (!options.webhookSecret) {
        response
          .status(503)
          .json({ error: "GitHub webhook secret is not configured." });
        return;
      }

      const deliveryIdHeader = request.headers["x-github-delivery"];
      const deliveryId =
        typeof deliveryIdHeader === "string" ? deliveryIdHeader : null;

      if (deliveryId && seenDeliveryIds.has(deliveryId)) {
        response.status(202).json({ status: "duplicate_ignored" });
        return;
      }

      const eventNameHeader = request.headers["x-github-event"];
      const eventName = typeof eventNameHeader === "string" ? eventNameHeader : null;
      const signatureHeader = request.headers["x-hub-signature-256"];
      const signature =
        typeof signatureHeader === "string" ? signatureHeader : null;
      const rawBody = request.body;

      if (!Buffer.isBuffer(rawBody)) {
        response.status(400).json({ error: "Expected raw request body." });
        return;
      }

      const signatureValid = verifyGitHubWebhookSignature(
        rawBody,
        signature,
        options.webhookSecret
      );

      if (!signatureValid) {
        response.status(401).json({ error: "Invalid webhook signature." });
        return;
      }

      if (deliveryId) {
        seenDeliveryIds.add(deliveryId);
      }

      let payload: unknown;

      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({ error: "Invalid JSON payload." });
        return;
      }

      const normalizedEvent = normalizeGitHubWebhookEvent(
        eventName,
        payload as GitHubPullRequestWebhookPayload | GitHubIssueWebhookPayload
      );

      if (!normalizedEvent || normalizedEvent.kind !== "pull_request") {
        response.status(202).json({ status: "ignored" });
        return;
      }

      const run = options.runStore.startPullRequestReview(
        normalizedEvent.details
      );

      response.status(202).json({
        runId: run.id,
        status: "accepted"
      });
    }
  );
}
