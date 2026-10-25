import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { newId } from "../shared/id.js";

export const OWNER_NAME = "Owner";

export async function createOwnerUser(db: Db, rawEmail: string): Promise<{ created: boolean; email: string }> {
  const email = rawEmail.trim().toLowerCase();
  const inserted = await db
    .insert(users)
    .values({ id: newId("user"), name: OWNER_NAME, email, emailVerified: true })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  return { created: inserted.length > 0, email };
}
