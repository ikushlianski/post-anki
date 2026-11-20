import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { notionImportLog } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { ImportLogEntry } from "./english-phrases.sync.js";

export async function insertImportLog(entry: ImportLogEntry): Promise<string> {
  const id = newId("nil");

  await getDb().insert(notionImportLog).values({ id, ...entry });

  return id;
}

export async function markImportDeleted(logId: string, at: Date | null, error: string | null): Promise<void> {
  await getDb().update(notionImportLog).set({ deletedAt: at, deleteError: error }).where(eq(notionImportLog.id, logId));
}

export async function listRestorableImports(connector: string) {
  return getDb()
    .select()
    .from(notionImportLog)
    .where(and(eq(notionImportLog.connector, connector), isNotNull(notionImportLog.deletedAt)))
    .orderBy(asc(notionImportLog.importedAt));
}
