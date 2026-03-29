import type {
  ModelProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult
} from "../model-provider";

const DEFAULT_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type FetchLike = typeof fetch;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface GeminiErrorResponse {
  error?: {
    details?: Array<{
      reason?: string;
    }>;
    message?: string;
    status?: string;
  };
}

export interface GeminiProviderOptions {
  apiKey: string;
  apiUrl?: string;
  defaultModel?: string;
  fetchImpl?: FetchLike;
}

/**
 * Gemini model provider implementation backed by the public REST API.
 */
export class GeminiProvider implements ModelProvider {
  private readonly apiKey: string;

  private readonly apiUrl: string;

  private readonly defaultModel: string;

  private readonly fetchImpl: FetchLike;

  /**
   * Creates a Gemini provider.
   *
   * @param options - Runtime options and credentials.
   */
  public constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? DEFAULT_GEMINI_API_URL;
    this.defaultModel = options.defaultModel ?? DEFAULT_GEMINI_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Generates free-form text from Gemini.
   *
   * @param request - Text generation request payload.
   * @returns Text generation result.
   */
  public async generateText(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult> {
    const model = request.model ?? this.defaultModel;

    const text = await this.generate(
      model,
      request.prompt,
      request.temperature,
      request.systemPrompt
    );

    return {
      model,
      provider: "gemini",
      text
    };
  }

  /**
   * Generates structured JSON output and validates it against a schema.
   *
   * @param request - Structured generation request payload.
   * @returns Structured and validated generation result.
   */
  public async generateStructured<TOutput>(
    request: StructuredGenerationRequest<TOutput>
  ): Promise<StructuredGenerationResult<TOutput>> {
    const model = request.model ?? this.defaultModel;

    const text = await this.generate(
      model,
      request.prompt,
      request.temperature,
      request.systemPrompt,
      "application/json"
    );

    const parsed = request.schema.parse(JSON.parse(text));

    return {
      data: parsed,
      model,
      provider: "gemini",
      text
    };
  }

  /**
   * Calls Gemini API and extracts text output.
   *
   * @param model - Target model name.
   * @param prompt - User prompt text.
   * @param temperature - Optional sampling temperature.
   * @param systemPrompt - Optional system instruction.
   * @param responseMimeType - Optional desired response MIME type.
   * @returns Text response from Gemini.
   */
  private async generate(
    model: string,
    prompt: string,
    temperature?: number,
    systemPrompt?: string,
    responseMimeType?: string
  ): Promise<string> {
    const endpoint = `${this.apiUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await this.fetchImpl(endpoint, {
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType,
          temperature
        },
        systemInstruction: systemPrompt
          ? {
              parts: [{ text: systemPrompt }]
            }
          : undefined
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(this.toProviderErrorMessage(response.status, errorBody));
    }

    const body = (await response.json()) as GeminiResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini response did not contain text output");
    }

    return text;
  }

  private toProviderErrorMessage(statusCode: number, responseBody: string): string {
    const parsed = this.tryParseError(responseBody);
    const reason = parsed.error?.details?.[0]?.reason;

    if (reason === "API_KEY_INVALID") {
      return "Gemini API key is invalid. Set GEMINI_API_KEY to a valid key.";
    }

    if (parsed.error?.message) {
      return `Gemini request failed (${statusCode}): ${parsed.error.message}`;
    }

    return `Gemini request failed (${statusCode}).`;
  }

  private tryParseError(responseBody: string): GeminiErrorResponse {
    try {
      return JSON.parse(responseBody) as GeminiErrorResponse;
    } catch {
      return {};
    }
  }
}
