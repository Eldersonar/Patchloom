import { z } from "zod";

const booleanEnvSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off", ""].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  APP_VERSION: z.string().default("0.1.0"),
  DATABASE_URL: z.string().url(),
  DEMO_MODE: booleanEnvSchema.default(false),
  GITHUB_API_URL: z.string().url().default("https://api.github.com"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
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
