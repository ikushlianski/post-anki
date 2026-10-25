import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { newId } from "../shared/id.js";

export const OWNER_NAME = "Owner";

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export async function createOwnerUser(db: Db, rawEmail: string): Promise<{ created: boolean; email: string }> {
  const email = normalizeEmail(rawEmail);
  const inserted = await db
    .insert(users)
    .values({ id: newId("user"), name: OWNER_NAME, email, emailVerified: true })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  return { created: inserted.length > 0, email };
}
