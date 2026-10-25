import { z } from "zod";

const MIN_AUTH_SECRET_LENGTH = 32;

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envObject = z.object({
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_MODE: z.enum(["real", "cheap", "mock"]).default("real"),
  LLM_DAILY_BUDGET_USD: z.coerce.number().min(0).default(5),
  MOCK_LLM_PORT: z.coerce.number().int().positive().default(4989),
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
  SYNC_JWT_PRIVATE_KEY: z.string().min(1).optional(),
  SYNC_JWT_KEY_ID: z.string().min(1).default("sync-key-1"),
  SYNC_JWT_AUDIENCE: z.string().min(1).default("http://localhost:5590"),
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
  // Extra exact web origins, comma separated (for example the custom domain next
  // to the Cloud Run URL). Entries that are not https origins, or http on localhost, are ignored.
  WEB_ORIGINS: z.string().min(1).optional(),
  RESEND_API_KEY: optionalNonEmpty,
  AUTH_EMAIL_FROM: optionalNonEmpty,
  BETTER_AUTH_SECRET: optionalNonEmpty,
  BETTER_AUTH_URL: optionalNonEmpty,
  OWNER_EMAIL: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().email().optional(),
  ),
  EXTENSION_ID: z.string().min(1).optional(),
  NOTION_TOKEN: z.string().min(1).optional(),
  // Durable extraction pilot. Plain strings on purpose: an empty or odd value must never stop the
  // API from booting; the pilot code parses them and falls back to its defaults (off, 10 s, 30 min).
  DURABLE_EXTRACTION: z.string().optional(),
  DURABLE_CARDS: z.string().optional(),
  DURABLE_COURSE_JOBS: z.string().optional(),
  DURABLE_BACKGROUND_JOBS: z.string().optional(),
  DBOS_APPLICATION_VERSION: z.string().optional(),
  DBOS_EXECUTOR_ID: z.string().optional(),
  DURABLE_EXTRACTION_TIMEOUT_MS: z.string().optional(),
  DURABLE_EXTRACTION_STALE_MS: z.string().optional(),
  INNGEST_DEV: z.string().optional(),
  INNGEST_BASE_URL: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY_FALLBACK: z.string().optional(),
  DURABLE_EXTRACTION_ENGINE: z.string().optional().default("inngest"),
});

const envSchema = envObject.superRefine((env, ctx) => {
  const durableOn = [
    env.DURABLE_EXTRACTION,
    env.DURABLE_CARDS,
    env.DURABLE_COURSE_JOBS,
    env.DURABLE_BACKGROUND_JOBS,
  ].some((flag) => flag === "1" || flag === "true");
  const localDev = env.INNGEST_DEV === "1";

  if (env.LLM_MODE !== "mock" && !env.OPENROUTER_API_KEY?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENROUTER_API_KEY"],
      message: "required unless LLM_MODE=mock",
    });
  }

  const secretRequired = env.NODE_ENV === "production" || Boolean(env.RESEND_API_KEY);

  if (secretRequired && (env.BETTER_AUTH_SECRET?.length ?? 0) < MIN_AUTH_SECRET_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BETTER_AUTH_SECRET"],
      message: `required (at least ${MIN_AUTH_SECRET_LENGTH} characters) in production or when RESEND_API_KEY is set`,
    });
  }

  if (env.NODE_ENV === "production" && env.RESEND_API_KEY) {
    for (const key of ["BETTER_AUTH_URL", "AUTH_EMAIL_FROM"] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "required in production when RESEND_API_KEY is set",
        });
      }
    }
  }

  if (durableOn && !localDev && !env.INNGEST_SIGNING_KEY?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INNGEST_SIGNING_KEY"],
      message:
        "required when DURABLE_EXTRACTION, DURABLE_CARDS, DURABLE_COURSE_JOBS or DURABLE_BACKGROUND_JOBS is on and INNGEST_DEV is not 1",
    });
  }

  if (durableOn && !localDev && !env.INNGEST_EVENT_KEY?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INNGEST_EVENT_KEY"],
      message:
        "required when DURABLE_EXTRACTION, DURABLE_CARDS, DURABLE_COURSE_JOBS or DURABLE_BACKGROUND_JOBS is on and INNGEST_DEV is not 1",
    });
  }
}).transform((env) => ({
  ...env,
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY?.trim() || "mock-unused",
  OPENROUTER_BASE_URL:
    env.OPENROUTER_BASE_URL ?? (env.LLM_MODE === "mock" ? `http://127.0.0.1:${env.MOCK_LLM_PORT}/v1` : undefined),
}));

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
