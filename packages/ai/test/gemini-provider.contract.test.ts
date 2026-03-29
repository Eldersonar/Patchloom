import { GeminiProvider } from "../src/providers/gemini-provider";
import { runModelProviderContractTests } from "./provider-contract";

/**
 * Creates a deterministic Gemini provider backed by a mock fetch response.
 *
 * @returns Gemini provider for contract testing.
 */
function createGeminiProviderForContract(): GeminiProvider {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const responseMimeType = body.generationConfig?.responseMimeType;

    const text =
      responseMimeType === "application/json"
        ? '{"severity":"medium"}'
        : "contract text output";

    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }]
      }),
      { status: 200 }
    );
  };

  return new GeminiProvider({
    apiKey: "test-key",
    fetchImpl
  });
}

runModelProviderContractTests({
  createProvider: () => createGeminiProviderForContract(),
  providerName: "gemini"
});
