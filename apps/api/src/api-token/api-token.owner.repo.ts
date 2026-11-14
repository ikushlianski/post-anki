import { and, desc, eq, isNull } from "drizzle-orm";
import type { ApiTokenSummary } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { apiTokens } from "../db/schema.js";

function toSummary(row: typeof apiTokens.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    name: row.label,
    scopes: row.scopes ?? [],
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export async function listApiTokens(db: DbExecutor = getDb()): Promise<ApiTokenSummary[]> {
  const rows = await db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt));

  return rows.map(toSummary);
}

export async function getApiTokenSummary(id: string, db: DbExecutor = getDb()): Promise<ApiTokenSummary | null> {
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);

  return row ? toSummary(row) : null;
}

export async function revokeApiTokenById(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const revoked = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });

  return revoked.length > 0;
}
