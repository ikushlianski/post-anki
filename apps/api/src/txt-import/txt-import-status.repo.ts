import { count, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { ankiImportNotes, knowledgeSources } from "../db/schema.js";
import { countImportNotesByStatus, type ImportStatusCounts } from "../anki-import/anki-import.repo.js";

export interface TxtImportStatus extends ImportStatusCounts {
  importId: string;
  extracted: number;
}

export async function getTxtImportStatus(importId: string, db: DbExecutor = getDb()): Promise<TxtImportStatus> {
  const counts = await countImportNotesByStatus(importId, db);
  const rows = await db
    .select({ status: knowledgeSources.status, total: count() })
    .from(ankiImportNotes)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, ankiImportNotes.sourceId))
    .where(eq(ankiImportNotes.importId, importId))
    .groupBy(knowledgeSources.status);
  const extracted = rows.filter((row) => row.status === "bits_detected").reduce((sum, row) => sum + Number(row.total), 0);

  return { importId, ...counts, extracted };
}
