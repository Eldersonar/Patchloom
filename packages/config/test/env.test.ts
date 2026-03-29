import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/env";

describe("loadEnvironment", () => {
  it("returns defaults for optional fields", () => {
    const result = loadEnvironment({
      DATABASE_URL: "https://example.com/db",
      REDIS_URL: "https://example.com/redis"
    });

    expect(result.MODEL_PROVIDER).toBe("gemini");
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(4000);
    expect(result.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(result.GITHUB_API_URL).toBe("https://api.github.com");
  });

  it("throws for invalid required values", () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL: "not-a-url",
        REDIS_URL: "https://example.com/redis"
      })
    ).toThrowError();
  });
});
