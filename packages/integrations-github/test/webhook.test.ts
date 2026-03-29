import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  extractIssueWebhookDetails,
  normalizeGitHubWebhookEvent,
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

  it("returns false for malformed hex signatures", () => {
    const rawBody = Buffer.from('{"action":"opened"}', "utf8");
    const malformedSignature = `sha256=${"z".repeat(64)}`;

    expect(
      verifyGitHubWebhookSignature(rawBody, malformedSignature, "test-secret")
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

describe("extractIssueWebhookDetails", () => {
  it("returns details for supported issue actions", () => {
    const details = extractIssueWebhookDetails("issues", {
      action: "opened",
      issue: {
        body: "Users are logged out after profile update.",
        number: 21,
        title: "Users randomly logged out"
      },
      repository: {
        full_name: "acme/payments"
      }
    });

    expect(details).toEqual({
      issueBody: "Users are logged out after profile update.",
      issueNumber: 21,
      issueTitle: "Users randomly logged out",
      repository: "acme/payments"
    });
  });

  it("returns null for unsupported issue actions", () => {
    expect(
      extractIssueWebhookDetails("issues", {
        action: "closed"
      })
    ).toBeNull();
  });
});

describe("normalizeGitHubWebhookEvent", () => {
  it("normalizes pull request payloads", () => {
    const normalized = normalizeGitHubWebhookEvent("pull_request", {
      action: "opened",
      pull_request: {
        number: 22,
        title: "Add billing guardrails"
      },
      repository: {
        full_name: "acme/payments"
      }
    });

    expect(normalized).toEqual({
      details: {
        pullRequestNumber: 22,
        pullRequestTitle: "Add billing guardrails",
        repository: "acme/payments"
      },
      kind: "pull_request"
    });
  });

  it("normalizes issue payloads", () => {
    const normalized = normalizeGitHubWebhookEvent("issues", {
      action: "opened",
      issue: {
        body: "Billing edge case after deploy.",
        number: 44,
        title: "Billing edge case"
      },
      repository: {
        full_name: "acme/payments"
      }
    });

    expect(normalized).toEqual({
      details: {
        issueBody: "Billing edge case after deploy.",
        issueNumber: 44,
        issueTitle: "Billing edge case",
        repository: "acme/payments"
      },
      kind: "issue"
    });
  });
});
