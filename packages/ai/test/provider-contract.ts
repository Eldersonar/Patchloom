import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ModelProvider } from "../src/model-provider";

export interface ProviderContractOptions {
  createProvider: () => ModelProvider;
  providerName: string;
}

/**
 * Runs shared model-provider contract tests for a provider implementation.
 *
 * @param options - Contract test configuration.
 */
export function runModelProviderContractTests(
  options: ProviderContractOptions
): void {
  describe(`${options.providerName} provider contract`, () => {
    it("supports text generation", async () => {
      const provider = options.createProvider();
      const result = await provider.generateText({
        prompt: "Return any text"
      });

      expect(result.provider).toBe(options.providerName);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it("supports structured generation", async () => {
      const provider = options.createProvider();
      const result = await provider.generateStructured({
        prompt: "Return JSON with severity",
        schema: z.object({
          severity: z.enum(["low", "medium", "high"])
        })
      });

      expect(result.provider).toBe(options.providerName);
      expect(result.data.severity).toBeTypeOf("string");
    });
  });
}
