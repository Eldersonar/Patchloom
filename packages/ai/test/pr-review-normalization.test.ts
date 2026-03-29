import { describe, expect, it } from "vitest";

import {
  refineGeneratedItems,
  refineSummary
} from "../src/workflows/pr-review-normalization";

describe("pr-review-normalization", () => {
  it("deduplicates and trims generated items", () => {
    const refined = refineGeneratedItems(
      [
        "1. Add regression test for token refresh expiry edge.",
        "- Add regression test for token refresh expiry edge.",
        "  Validate cache invalidation after profile update.  ",
        "x"
      ],
      { maxItems: 4, maxLength: 80 }
    );

    expect(refined).toEqual([
      "Add regression test for token refresh expiry edge.",
      "Validate cache invalidation after profile update."
    ]);
  });

  it("limits long summary output", () => {
    const summary = refineSummary(
      "Sentence one explains the core change. Sentence two explains risk areas. " +
        "Sentence three explains expected tests. Sentence four should be dropped."
    );

    expect(summary).toContain("Sentence one");
    expect(summary).toContain("Sentence three");
    expect(summary).not.toContain("Sentence four");
  });

  it("truncates long generated items at sentence boundaries", () => {
    const refined = refineGeneratedItems(
      [
        "Validate token rotation on refresh boundaries. Ensure revoked token path does not re-authenticate stale sessions. Add rollback checks for auth edge failures."
      ],
      { maxItems: 3, maxLength: 95 }
    );

    expect(refined).toEqual([
      "Validate token rotation on refresh boundaries."
    ]);
  });
});
