import type { ModelProvider } from "./model-provider";
import { GeminiProvider } from "./providers/gemini-provider";

export interface ProviderFactoryConfig {
  geminiApiKey?: string;
  geminiModel?: string;
  modelProvider: "gemini" | "openai" | "anthropic";
}

/**
 * Creates a model provider from runtime config.
 *
 * @param config - Provider selection and credentials.
 * @returns Configured model provider instance.
 */
export function createModelProvider(config: ProviderFactoryConfig): ModelProvider {
  if (config.modelProvider === "gemini") {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required when MODEL_PROVIDER=gemini");
    }

    return new GeminiProvider({
      apiKey: config.geminiApiKey,
      defaultModel: config.geminiModel
    });
  }

  throw new Error(`Unsupported MODEL_PROVIDER: ${config.modelProvider}`);
}
