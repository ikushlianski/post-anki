import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { apiTokens, sessions, users } from "../db/schema.js";
import { getOwnerEmail } from "../auth/owner-user.js";
import { selectTokenToRevoke, type TokenSelection } from "./select-token-to-revoke.js";

export type RevokeResult =
  | { ok: true; id: string; label: string; sessionsEnded: number }
  | Extract<TokenSelection, { ok: false }>;

export async function revokeApiToken(db: Db, selector: string): Promise<RevokeResult> {
  const tokens = await db
    .select({ id: apiTokens.id, label: apiTokens.label, revokedAt: apiTokens.revokedAt })
    .from(apiTokens);
  const selection = selectTokenToRevoke(tokens, selector);

  if (!selection.ok) {
    return selection;
  }

  const ownerEmail = getOwnerEmail();

  return db.transaction(async (tx) => {
    await tx.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, selection.token.id));

    const [owner] = ownerEmail
      ? await tx.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail)).limit(1)
      : [];
    const ended = owner
      ? await tx.delete(sessions).where(eq(sessions.userId, owner.id)).returning({ id: sessions.id })
      : [];

    return { ok: true as const, id: selection.token.id, label: selection.token.label, sessionsEnded: ended.length };
  });
}
