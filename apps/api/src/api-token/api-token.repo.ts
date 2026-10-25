import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { apiTokens, users } from "../db/schema.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";

export class UnknownTokenOwnerError extends Error {
  constructor(email: string) {
    super(`No user with email ${email}; create it first with db:create-user`);
    this.name = "UnknownTokenOwnerError";
  }
}

export async function insertApiToken(
  input: { label: string; tokenHash: string; ownerEmail?: string },
  db: DbExecutor = getDb(),
): Promise<{ id: string; userId: string | null }> {
  let userId: string | null = null;

  if (input.ownerEmail !== undefined) {
    const email = input.ownerEmail.trim().toLowerCase();
    const owners = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (!owners[0]) {
      throw new UnknownTokenOwnerError(email);
    }

    userId = owners[0].id;
  }

  const id = newId("apitoken");

  await db.insert(apiTokens).values({ id, label: input.label, tokenHash: input.tokenHash, userId });

  return { id, userId };
}

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
  db: DbExecutor = getDb(),
): Promise<{ id: string; revokedAt: string | null } | null> {
  const rows = await db
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
  try {
    await getDb()
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, id));
  } catch (err) {
    log.warn({ err, id }, "touch_last_used_failed");
  }
}
