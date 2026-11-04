import { and, desc, eq, lt, ne } from "drizzle-orm";
import type { Account } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export interface CurrentSession {
  userId: string;
  sessionId: string;
  sessionCreatedAt: Date;
}

export async function findLastSignInAt(db: DbExecutor, current: CurrentSession): Promise<Date> {
  const [previous] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, current.userId),
        ne(sessions.id, current.sessionId),
        lt(sessions.createdAt, current.sessionCreatedAt),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1);

  return previous?.createdAt ?? current.sessionCreatedAt;
}

export async function getAccount(db: DbExecutor, current: CurrentSession): Promise<Account | null> {
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, current.userId));

  if (!user) {
    return null;
  }

  const lastSignInAt = await findLastSignInAt(db, current);

  return { email: user.email, name: user.name, lastSignInAt: lastSignInAt.toISOString() };
}

export async function updateAccountName(
  db: DbExecutor,
  current: CurrentSession,
  name: string,
): Promise<Account | null> {
  const updated = await db.update(users).set({ name }).where(eq(users.id, current.userId)).returning({ id: users.id });

  return updated.length === 0 ? null : getAccount(db, current);
}
