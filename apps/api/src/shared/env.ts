import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  CURRICULUM_MODEL: z.string().min(1).default("openrouter/google/gemini-2.5-flash"),
  EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  OPENROUTER_BASE_URL: z.string().min(1).optional(),
  API_SHARED_SECRET: z.string().min(1).optional(),
  ELECTRIC_SERVICE_URL: z.string().min(1).optional(),
  ELECTRIC_AUTH_MODE: z.enum(["iam", "none"]).default("iam"),
  PORT: z.coerce.number().int().positive().default(8030),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().min(1).default("https://cloud.langfuse.com"),
  // doc-changelog-scan (issue #49) — e2e-stage-only bypass for
  // tracked-tool-fetcher.ts's real outbound HTTPS calls (spec.md's Fetch
  // mechanism section, "E2E override"). JSON-encoded Record<toolKey,
  // string>. Same shape/rationale as resolveAgentModel's OPENROUTER_BASE_URL
  // override — set only in verification-repo's e2e stage env, never in
  // dev/prod.
  E2E_MOCK_TRACKED_TOOL_CONTENT: z.string().min(1).optional(),
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
