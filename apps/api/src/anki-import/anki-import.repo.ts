import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { ankiImportNotes } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { StagedNoteRow } from "./anki-import-staging.js";

export interface StoredImportNote {
  id: string;
  noteKey: string;
  deck: string;
  rawText: string;
}

export interface ImportStatusCounts {
  staged: number;
  imported: number;
}

export async function stageImportNotes(
  importId: string,
  rows: readonly StagedNoteRow[],
  db: DbExecutor = getDb(),
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const inserted = await db
    .insert(ankiImportNotes)
    .values(rows.map((row) => ({ id: newId("aimp"), importId, ...row })))
    .onConflictDoNothing({ target: [ankiImportNotes.importId, ankiImportNotes.noteKey] })
    .returning({ id: ankiImportNotes.id });

  return inserted.length;
}

export async function takeNextStagedNotes(
  importId: string,
  limit: number,
  db: DbExecutor = getDb(),
): Promise<StoredImportNote[]> {
  return db
    .select({
      id: ankiImportNotes.id,
      noteKey: ankiImportNotes.noteKey,
      deck: ankiImportNotes.deck,
      rawText: ankiImportNotes.rawText,
    })
    .from(ankiImportNotes)
    .where(and(eq(ankiImportNotes.importId, importId), eq(ankiImportNotes.status, "staged")))
    .orderBy(asc(ankiImportNotes.position))
    .limit(limit);
}

export async function markNotesImported(
  entries: readonly { id: string; sourceId: string }[],
  db: DbExecutor = getDb(),
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const pairs = sql.join(
    entries.map((entry) => sql`(${entry.id}, ${entry.sourceId})`),
    sql`, `,
  );

  await db.execute(sql`
    UPDATE anki_import_notes AS n
       SET status = 'imported', source_id = v.source_id, updated_at = now()
      FROM (VALUES ${pairs}) AS v(id, source_id)
     WHERE n.id = v.id
  `);
}

export async function listStagedDecks(importId: string, db: DbExecutor = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ deck: ankiImportNotes.deck })
    .from(ankiImportNotes)
    .where(and(eq(ankiImportNotes.importId, importId), eq(ankiImportNotes.status, "staged")));

  return rows.map((row) => row.deck);
}

export async function countImportNotesByStatus(
  importId: string,
  db: DbExecutor = getDb(),
): Promise<ImportStatusCounts> {
  const rows = await db
    .select({ status: ankiImportNotes.status, total: count() })
    .from(ankiImportNotes)
    .where(and(eq(ankiImportNotes.importId, importId), inArray(ankiImportNotes.status, ["staged", "imported"])))
    .groupBy(ankiImportNotes.status);
  const byStatus = new Map(rows.map((row) => [row.status, Number(row.total)]));

  return { staged: byStatus.get("staged") ?? 0, imported: byStatus.get("imported") ?? 0 };
}
