import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { facts, notionConnectorRuns, notionSyncItems } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface InsertFactInput {
  body: string;
  source: string;
  sourceRef: string;
  tags: string[];
}

export async function listSyncedNotionIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }

  const rows = await getDb()
    .select({ notionId: notionSyncItems.notionId })
    .from(notionSyncItems)
    .where(inArray(notionSyncItems.notionId, ids));

  return new Set(rows.map((row) => row.notionId));
}

export async function recordSynced(
  notionId: string,
  connector: string,
  destination: string,
): Promise<void> {
  await getDb()
    .insert(notionSyncItems)
    .values({ notionId, connector, destination })
    .onConflictDoNothing({ target: notionSyncItems.notionId });
}

export async function insertFact(input: InsertFactInput): Promise<void> {
  await getDb()
    .insert(facts)
    .values({ id: newId("fact"), ...input })
    .onConflictDoNothing({ target: facts.sourceRef });
}

export async function lastConnectorRunAt(connector: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ lastRunAt: notionConnectorRuns.lastRunAt })
    .from(notionConnectorRuns)
    .where(eq(notionConnectorRuns.connector, connector));

  return row?.lastRunAt ?? null;
}

export async function recordConnectorRun(connector: string, at: Date): Promise<void> {
  await getDb()
    .insert(notionConnectorRuns)
    .values({ connector, lastRunAt: at })
    .onConflictDoUpdate({ target: notionConnectorRuns.connector, set: { lastRunAt: at } });
}
