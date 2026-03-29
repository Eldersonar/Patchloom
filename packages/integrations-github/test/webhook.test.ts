import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  extractPullRequestWebhookDetails,
  verifyGitHubWebhookSignature
} from "../src/webhook";

describe("verifyGitHubWebhookSignature", () => {
  it("returns true for valid signatures", () => {
    const secret = "test-secret";
    const rawBody = Buffer.from('{"action":"opened"}', "utf8");
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    const signature = `sha256=${digest}`;

    expect(verifyGitHubWebhookSignature(rawBody, signature, secret)).toBe(true);
  });

  it("returns false for invalid signatures", () => {
    const rawBody = Buffer.from('{"action":"opened"}', "utf8");

    expect(
      verifyGitHubWebhookSignature(rawBody, "sha256=1234", "test-secret")
    ).toBe(false);
  });
});

describe("extractPullRequestWebhookDetails", () => {
  it("returns details for supported pull_request actions", () => {
    const details = extractPullRequestWebhookDetails("pull_request", {
      action: "synchronize",
      pull_request: {
        number: 304,
        title: "Fix staging configuration"
      },
      repository: {
        full_name: "acme/payments"
      }
    });

    expect(details).toEqual({
      pullRequestNumber: 304,
      pullRequestTitle: "Fix staging configuration",
      repository: "acme/payments"
    });
  });

  it("returns null for unsupported events or missing fields", () => {
    expect(
      extractPullRequestWebhookDetails("issues", {
        action: "opened"
      })
    ).toBeNull();

    expect(
      extractPullRequestWebhookDetails("pull_request", {
        action: "closed"
      })
    ).toBeNull();
  });
});
