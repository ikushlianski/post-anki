import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  CURRICULUM_MODEL: z.string().min(1).default("openrouter/google/gemini-2.5-flash"),
  EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  // Voice responses (issue #22, spec.md Decision 2) — deliberately its own
  // var, not a reuse of CURRICULUM_MODEL: apps/api/.env.example's own local
  // CURRICULUM_MODEL value (gpt-4o-mini) is not audio-capable, so reusing it
  // would silently break transcription in local dev. Same OPENROUTER_API_KEY,
  // no new credential.
  TRANSCRIPTION_MODEL: z.string().min(1).default("openrouter/google/gemini-2.5-flash"),
  OPENROUTER_BASE_URL: z.string().min(1).optional(),
  API_SHARED_SECRET: z.string().min(1).optional(),
  ELECTRIC_SERVICE_URL: z.string().min(1).optional(),
  ELECTRIC_AUTH_MODE: z.enum(["iam", "none"]).default("iam"),
  PORT: z.coerce.number().int().positive().default(5560),
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
  /* learning-list-intake (SCENARIO 14) — e2e-stage-only exemption from
     guarded-fetch.ts's private/internal-address rejection, so the local mock
     docs sites on loopback stay reachable. Comma-separated origins, e.g.
     "http://localhost:4998,http://localhost:4997". The http/https scheme
     check is never exempted. Set only in verification-repo's e2e stage env,
     never in dev/prod. */
  E2E_SOURCE_FETCH_ALLOWED_ORIGINS: z.string().min(1).optional(),
  // The web app's own origin, so the API can answer CORS preflights for
  // browser-side fetches (client-side route navigation, mutations). Web and
  // API are always separate origins — separate Cloud Run services in prod,
  // separate ports in dev — so this is never optional in practice; it
  // defaults to the local dev web port only.
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5540"),
  EXTENSION_ID: z.string().min(1).optional(),
  NOTION_TOKEN: z.string().min(1).optional(),
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
