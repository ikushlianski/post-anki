import { hkdfSync } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, magicLink } from "better-auth/plugins";
import { getDb, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { loadEnv } from "../shared/env.js";
import { apiKeySignIn } from "./api-key-sign-in.plugin.js";
import { MIN_PASSWORD_LENGTH } from "./owner-password.js";
import { isOwnerEmail } from "./owner-user.js";
import { sendMagicLink } from "./send-magic-link.js";

const DEFAULT_WEB_ORIGIN = "http://localhost:5540";
const MIN_AUTH_SECRET_LENGTH = 32;
const MAGIC_LINK_TTL_SECONDS = 600;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SIGN_IN_RATE = { window: 60, max: 5 };
const SIGN_OUT_RATE = { window: 60, max: 20 };
const EMAIL_SIGN_IN_PATH = "/sign-in/email";
const DUMMY_PASSWORD = "not-the-owner-password";
export const CLIENT_IP_HEADER = "x-pa-client-ip";

const ownerOnlySignIn = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== EMAIL_SIGN_IN_PATH) {
    return;
  }

  const email: unknown = ctx.body?.email;

  if (typeof email === "string" && isOwnerEmail(email)) {
    return;
  }

  await ctx.context.password.hash(DUMMY_PASSWORD);

  throw APIError.from("UNAUTHORIZED", {
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  });
});

function resolveAuthSecret(env: ReturnType<typeof loadEnv>): string | undefined {
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= MIN_AUTH_SECRET_LENGTH) {
    return env.BETTER_AUTH_SECRET;
  }

  if (!env.API_SHARED_SECRET) {
    return env.BETTER_AUTH_SECRET;
  }

  return Buffer.from(hkdfSync("sha256", env.API_SHARED_SECRET, "post-anki", "better-auth-secret", 32)).toString("hex");
}

export function createAuth(db: Db, sendLink: typeof sendMagicLink = sendMagicLink) {
  const env = loadEnv();
  const origin = env.BETTER_AUTH_URL ?? DEFAULT_WEB_ORIGIN;

  return betterAuth({
    baseURL: origin,
    secret: resolveAuthSecret(env),
    trustedOrigins: [origin],
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    session: { expiresIn: SESSION_TTL_SECONDS },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      requireEmailVerification: false,
    },
    hooks: {
      before: ownerOnlySignIn,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        [EMAIL_SIGN_IN_PATH]: SIGN_IN_RATE,
        "/sign-in/api-key": SIGN_IN_RATE,
        "/sign-in/magic-link": SIGN_IN_RATE,
        "/sign-out": SIGN_OUT_RATE,
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    plugins: [
      bearer(),
      apiKeySignIn(db),
      ...(env.RESEND_API_KEY
        ? [
            magicLink({
              expiresIn: MAGIC_LINK_TTL_SECONDS,
              disableSignUp: true,
              storeToken: "hashed",
              sendMagicLink: sendLink,
            }),
          ]
        : []),
    ],
  });
}

export type WebAuth = ReturnType<typeof createAuth>;

let cached: WebAuth | undefined;

export function getAuth(): WebAuth {
  cached ??= createAuth(getDb());

  return cached;
}
