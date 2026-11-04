import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { connectorSecrets } from "../db/schema.js";

export async function getConnectorSecret(name: string, db: DbExecutor = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ ciphertext: connectorSecrets.ciphertext })
    .from(connectorSecrets)
    .where(eq(connectorSecrets.name, name));

  return row?.ciphertext ?? null;
}

export async function saveConnectorSecret(
  name: string,
  ciphertext: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .insert(connectorSecrets)
    .values({ name, ciphertext })
    .onConflictDoUpdate({ target: connectorSecrets.name, set: { ciphertext, updatedAt: new Date() } });
}

export async function deleteConnectorSecret(name: string, db: DbExecutor = getDb()): Promise<void> {
  await db.delete(connectorSecrets).where(eq(connectorSecrets.name, name));
}
