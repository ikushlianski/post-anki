import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { getDb, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { loadEnv } from "../shared/env.js";
import { sendMagicLink } from "./send-magic-link.js";

const DEFAULT_WEB_ORIGIN = "http://localhost:5540";
const MAGIC_LINK_TTL_SECONDS = 600;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const CLIENT_IP_HEADER = "x-pa-client-ip";

export function createAuth(db: Db, sendLink: typeof sendMagicLink = sendMagicLink) {
  const env = loadEnv();
  const origin = env.BETTER_AUTH_URL ?? DEFAULT_WEB_ORIGIN;

  return betterAuth({
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
    session: { expiresIn: SESSION_TTL_SECONDS },
    rateLimit: { enabled: true, storage: "database" },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        disableSignUp: true,
        storeToken: "hashed",
        sendMagicLink: sendLink,
      }),
    ],
  });
}

export type WebAuth = ReturnType<typeof createAuth>;

let cached: WebAuth | undefined;

export function getAuth(): WebAuth {
  cached ??= createAuth(getDb());

  return cached;
}
