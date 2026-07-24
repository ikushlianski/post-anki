import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { apiTokens } from "../db/schema.js";

export function isTokenActive(
  token: { revokedAt: string | null },
  now: string,
): boolean {
  if (token.revokedAt === null) {
    return true;
  }

  return new Date(token.revokedAt).getTime() > new Date(now).getTime();
}

export async function findActiveTokenByHash(
  tokenHash: string,
): Promise<{ id: string; revokedAt: string | null } | null> {
  const rows = await getDb()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  const revokedAt = row.revokedAt ? row.revokedAt.toISOString() : null;

  if (!isTokenActive({ revokedAt }, new Date().toISOString())) {
    return null;
  }

  return { id: row.id, revokedAt };
}

export async function touchLastUsed(id: string): Promise<void> {
  await getDb()
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, id));
}
