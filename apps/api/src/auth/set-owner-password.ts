import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Db } from "../db/client.js";
import { accounts, sessions, users } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { ensureOwnerUser, getOwnerEmail } from "./owner-user.js";

const CREDENTIAL_PROVIDER = "credential";

export async function setOwnerPassword(db: Db, password: string): Promise<{ email: string }> {
  const { email } = await ensureOwnerUser(db);
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (!owner) {
      throw new Error("owner user missing");
    }

    const updated = await tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, owner.id), eq(accounts.providerId, CREDENTIAL_PROVIDER)))
      .returning({ id: accounts.id });

    if (updated.length === 0) {
      await tx.insert(accounts).values({
        id: newId("account"),
        accountId: owner.id,
        providerId: CREDENTIAL_PROVIDER,
        userId: owner.id,
        password: passwordHash,
      });
    }

    await tx.delete(sessions).where(eq(sessions.userId, owner.id));
  });

  return { email: getOwnerEmail() ?? email };
}
