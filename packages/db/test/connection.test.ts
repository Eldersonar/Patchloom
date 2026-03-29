import { describe, expect, it } from "vitest";

import {
  type DatabaseClientFactory,
  verifyDatabaseConnection
} from "../src/connection";

describe("verifyDatabaseConnection", () => {
  it("returns ok for successful connection and query", async () => {
    const createClient: DatabaseClientFactory = () => ({
      connect: async () => undefined,
      end: async () => undefined,
      query: async () => ({})
    });

    const result = await verifyDatabaseConnection(
      "postgres://example",
      createClient
    );

    expect(result).toEqual({ ok: true });
  });

  it("returns error details when connection fails", async () => {
    const createClient: DatabaseClientFactory = () => ({
      connect: async () => {
        throw new Error("connection failed");
      },
      end: async () => undefined,
      query: async () => ({})
    });

    const result = await verifyDatabaseConnection(
      "postgres://example",
      createClient
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection failed");
  });
});
