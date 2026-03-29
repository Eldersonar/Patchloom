import { describe, expect, it } from "vitest";

import { createGraphQLServer } from "../src/server";

describe("health query", () => {
  it("returns ok status and app version", async () => {
    const server = createGraphQLServer("0.1.0-test");
    await server.start();

    const result = await server.executeOperation({
      query: "query { health { status version } }"
    });

    await server.stop();

    expect(result.body.kind).toBe("single");

    if (result.body.kind !== "single") {
      throw new Error("Expected single response body");
    }

    expect(result.body.singleResult.errors).toBeUndefined();
    expect(result.body.singleResult.data).toEqual({
      health: {
        status: "ok",
        version: "0.1.0-test"
      }
    });
  });
});
