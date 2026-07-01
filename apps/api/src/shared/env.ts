import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  CURRICULUM_MODEL: z.string().min(1).default("openrouter/google/gemini-2.5-flash"),
  OPENROUTER_BASE_URL: z.string().min(1).optional(),
  API_SHARED_SECRET: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(8030),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().min(1).default("https://cloud.langfuse.com"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    throw new Error(`Invalid environment: ${issues}`);
  }

  cached = parsed.data;

  return cached;
}
