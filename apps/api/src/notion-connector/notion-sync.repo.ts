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

export async function listSyncedNotionItems(ids: string[]): Promise<Map<string, Date | null>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select({ notionId: notionSyncItems.notionId, lastEditedTime: notionSyncItems.lastEditedTime })
    .from(notionSyncItems)
    .where(inArray(notionSyncItems.notionId, ids));

  return new Map(rows.map((row) => [row.notionId, row.lastEditedTime]));
}

export async function recordSynced(
  notionId: string,
  connector: string,
  destination: string,
  lastEditedTime: Date,
): Promise<void> {
  await getDb()
    .insert(notionSyncItems)
    .values({ notionId, connector, destination, lastEditedTime })
    .onConflictDoUpdate({ target: notionSyncItems.notionId, set: { lastEditedTime } });
}

export async function insertFact(input: InsertFactInput): Promise<void> {
  await getDb()
    .insert(facts)
    .values({ id: newId("fact"), ...input })
    .onConflictDoUpdate({
      target: facts.sourceRef,
      set: { body: input.body, tags: input.tags },
    });
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
