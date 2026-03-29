import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GeminiProvider } from "../src/providers/gemini-provider";

describe("GeminiProvider", () => {
  it("generates text output", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "hello from gemini" }] } }]
        }),
        { status: 200 }
      );

    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl
    });

    const result = await provider.generateText({
      prompt: "Say hello"
    });

    expect(result.provider).toBe("gemini");
    expect(result.text).toBe("hello from gemini");
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("generates structured output", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"severity":"medium","confidence":0.7}' }]
              }
            }
          ]
        }),
        { status: 200 }
      );

    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl
    });

    const result = await provider.generateStructured({
      prompt: "Return severity and confidence",
      schema: z.object({
        confidence: z.number(),
        severity: z.enum(["low", "medium", "high"])
      })
    });

    expect(result.data).toEqual({
      confidence: 0.7,
      severity: "medium"
    });
  });

  it("throws when response has no text", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 });

    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl
    });

    await expect(
      provider.generateText({
        prompt: "no output"
      })
    ).rejects.toThrowError(/did not contain text output/);
  });

  it("throws when structured output fails schema validation", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"severity":"invalid"}' }]
              }
            }
          ]
        }),
        { status: 200 }
      );

    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl
    });

    await expect(
      provider.generateStructured({
        prompt: "Return valid severity",
        schema: z.object({
          severity: z.enum(["low", "medium", "high"])
        })
      })
    ).rejects.toThrowError();
  });
});
