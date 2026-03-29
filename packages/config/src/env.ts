import { z } from "zod";

const envSchema = z.object({
  APP_VERSION: z.string().default("0.1.0"),
  DATABASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  MODEL_PROVIDER: z.enum(["gemini", "openai", "anthropic"]).default("gemini"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  REDIS_URL: z.string().url()
});

export type AppEnvironment = z.infer<typeof envSchema>;

/**
 * Validates and returns runtime environment configuration.
 *
 * @param rawEnv - Environment source, usually process.env.
 * @returns Parsed and validated environment values.
 */
export function loadEnvironment(
  rawEnv: NodeJS.ProcessEnv = process.env
): AppEnvironment {
  return envSchema.parse(rawEnv);
}
