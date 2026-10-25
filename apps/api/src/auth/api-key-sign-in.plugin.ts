import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { hashApiToken } from "../api-token/api-token.hash.js";
import { isTokenActive } from "../api-token/api-token.repo.js";
import type { Db } from "../db/client.js";
import { apiTokens, users } from "../db/schema.js";
import { log } from "../shared/log.js";
import { ensureOwnerUser, getOwnerEmail } from "./owner-user.js";

export const API_KEY_SIGN_IN_PATH = "/sign-in/api-key";

const MAX_KEY_LENGTH = 256;
const keyBodySchema = z.object({ key: z.string().min(1).max(MAX_KEY_LENGTH) });
const ABSENT_HASH = Buffer.alloc(32);

export interface KeyCandidate {
  revokedAt: string | null;
  userId: string | null;
}

export function decideKeyEligibility(token: KeyCandidate, ownerId: string, now: string): boolean {
  return isTokenActive({ revokedAt: token.revokedAt }, now) && (token.userId === null || token.userId === ownerId);
}

export function hashesMatch(expectedHex: string | undefined, actualHex: string): boolean {
  const expected = expectedHex === undefined ? ABSENT_HASH : Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual) && expectedHex !== undefined;
}

function invalidKey(): APIError {
  return APIError.from("UNAUTHORIZED", { code: "INVALID_KEY", message: "Could not sign in" });
}

function unavailable(): APIError {
  return APIError.from("SERVICE_UNAVAILABLE", { code: "SIGN_IN_UNAVAILABLE", message: "Sign-in is unavailable" });
}

async function findTokenByHash(db: Db, tokenHash: string) {
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);

  return row;
}

export function apiKeySignIn(db: Db): BetterAuthPlugin {
  return {
    id: "api-key-sign-in",
    endpoints: {
      signInApiKey: createAuthEndpoint(API_KEY_SIGN_IN_PATH, { method: "POST" }, async (ctx) => {
        const origin = ctx.request?.headers.get("origin");

        if (origin && !ctx.context.isTrustedOrigin(origin)) {
          throw APIError.from("FORBIDDEN", { code: "INVALID_ORIGIN", message: "Invalid origin" });
        }

        const parsed = keyBodySchema.safeParse(ctx.body);
        const tokenHash = hashApiToken(parsed.success ? parsed.data.key : "");

        try {
          const token = await findTokenByHash(db, tokenHash);
          const matches = hashesMatch(token?.tokenHash, tokenHash);

          if (!parsed.success || !token || !matches || !getOwnerEmail()) {
            throw invalidKey();
          }

          await ensureOwnerUser(db);
          const [owner] = await db.select().from(users).where(eq(users.email, getOwnerEmail() ?? "")).limit(1);
          const revokedAt = token.revokedAt ? token.revokedAt.toISOString() : null;

          if (!owner || !decideKeyEligibility({ revokedAt, userId: token.userId }, owner.id, new Date().toISOString())) {
            throw invalidKey();
          }

          await db
            .update(apiTokens)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiTokens.id, token.id))
            .catch(() => log.warn({}, "api_key_last_used_failed"));

          const session = await ctx.context.internalAdapter.createSession(owner.id);

          await setSessionCookie(ctx, { session, user: owner });

          return ctx.json({ status: true });
        } catch (err) {
          if (err instanceof APIError) {
            throw err;
          }

          log.warn({}, "api_key_sign_in_unavailable");
          throw unavailable();
        }
      }),
    },
  };
}
