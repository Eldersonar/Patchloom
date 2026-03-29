import type { z } from "zod";

export interface TextGenerationRequest {
  model?: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface TextGenerationResult {
  model: string;
  provider: string;
  text: string;
}

export interface StructuredGenerationRequest<TOutput> {
  model?: string;
  prompt: string;
  schema: z.ZodType<TOutput>;
  systemPrompt?: string;
  temperature?: number;
}

export interface StructuredGenerationResult<TOutput> {
  data: TOutput;
  model: string;
  provider: string;
  text: string;
}

/**
 * Provider abstraction used by workflows to generate text and structured data.
 */
export interface ModelProvider {
  /**
   * Generates free-form text from a prompt.
   *
   * @param request - Text generation request payload.
   * @returns Generated text result.
   */
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;

  /**
   * Generates JSON output and validates it against the provided zod schema.
   *
   * @param request - Structured generation request payload.
   * @returns Parsed and validated structured result.
   */
  generateStructured<TOutput>(
    request: StructuredGenerationRequest<TOutput>
  ): Promise<StructuredGenerationResult<TOutput>>;
}
