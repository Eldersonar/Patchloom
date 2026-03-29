import { describe, expect, it } from "vitest";

import {
  LIST_OUTPUT_SCHEMA,
  classifyPullRequestType
} from "../src/workflows/pr-review-workflow-helpers";

describe("LIST_OUTPUT_SCHEMA", () => {
  it("normalizes object items into strings", () => {
    const parsed = LIST_OUTPUT_SCHEMA.parse({
      items: [
        { description: "Ensure refresh token expiry boundary behavior." },
        {
          description: "Validate cache invalidation after profile update.",
          title: "Integration test"
        },
        {
          nested: {
            text: "Check logout/login session recovery race conditions."
          }
        }
      ]
    });

    expect(parsed.items).toEqual([
      "Ensure refresh token expiry boundary behavior.",
      "Integration test: Validate cache invalidation after profile update.",
      "Check logout/login session recovery race conditions."
    ]);
  });

  it("fails when items cannot be normalized to strings", () => {
    expect(() =>
      LIST_OUTPUT_SCHEMA.parse({
        items: [{ data: null }]
      })
    ).toThrowError(/Unable to normalize item into string/);
  });
});

describe("classifyPullRequestType", () => {
  it("classifies scaffold pull requests from title and file mix", () => {
    const type = classifyPullRequestType({
      changedFiles: [
        "apps/api/src/index.ts (added, +120/-0)",
        "apps/web/src/main.tsx (added, +90/-0)",
        "packages/core/src/index.ts (added, +60/-0)",
        "packages/ai/src/index.ts (added, +40/-0)",
        "docker-compose.yml (added, +25/-0)",
        ".github/workflows/ci.yml (added, +30/-0)",
        "README.md (added, +75/-0)",
        "pnpm-workspace.yaml (added, +8/-0)"
      ],
      pullRequestBody: "Initial bootstrap of project foundation.",
      pullRequestNumber: 1,
      pullRequestTitle: "Initial monorepo scaffold setup",
      repository: "acme/service"
    });

    expect(type).toBe("scaffold");
  });

  it("classifies bugfix pull requests by title/body language", () => {
    const type = classifyPullRequestType({
      changedFiles: ["src/auth/session.ts (modified, +10/-4)"],
      pullRequestBody: "Fixes random logout regression in refresh logic.",
      pullRequestNumber: 2,
      pullRequestTitle: "Fix token refresh regression",
      repository: "acme/service"
    });

    expect(type).toBe("bugfix");
  });
});
