import { describe, expect, it } from "vitest";

import { createModelProvider } from "../src/provider-factory";
import { GeminiProvider } from "../src/providers/gemini-provider";

describe("createModelProvider", () => {
  it("creates a Gemini provider for gemini config", () => {
    const provider = createModelProvider({
      geminiApiKey: "test-key",
      modelProvider: "gemini"
    });

    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("throws when gemini key is missing", () => {
    expect(() =>
      createModelProvider({
        modelProvider: "gemini"
      })
    ).toThrowError(/GEMINI_API_KEY/);
  });

  it("throws for unsupported providers", () => {
    expect(() =>
      createModelProvider({
        modelProvider: "openai"
      })
    ).toThrowError(/Unsupported MODEL_PROVIDER/);
  });
});
