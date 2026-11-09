import { count, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { ankiImportNotes, knowledgeSources } from "../db/schema.js";
import { countImportNotesByStatus, type ImportStatusCounts } from "../anki-import/anki-import.repo.js";

export interface TxtImportStatus extends ImportStatusCounts {
  importId: string;
  extracted: number;
  finished: number;
}

const TERMINAL_SOURCE_STATUSES = ["bits_detected", "failed", "discarded"];

export function summarizeSourceStatuses(rows: { status: string; total: number | string }[]): { extracted: number; finished: number } {
  const sum = (statuses: string[]) =>
    rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + Number(row.total), 0);

  return { extracted: sum(["bits_detected"]), finished: sum(TERMINAL_SOURCE_STATUSES) };
}

export async function getTxtImportStatus(importId: string, db: DbExecutor = getDb()): Promise<TxtImportStatus> {
  const counts = await countImportNotesByStatus(importId, db);
  const rows = await db
    .select({ status: knowledgeSources.status, total: count() })
    .from(ankiImportNotes)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, ankiImportNotes.sourceId))
    .where(eq(ankiImportNotes.importId, importId))
    .groupBy(knowledgeSources.status);

  return { importId, ...counts, ...summarizeSourceStatuses(rows) };
}
