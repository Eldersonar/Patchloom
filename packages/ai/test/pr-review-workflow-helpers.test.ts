import { describe, expect, it } from "vitest";

import { LIST_OUTPUT_SCHEMA } from "../src/workflows/pr-review-workflow-helpers";

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
