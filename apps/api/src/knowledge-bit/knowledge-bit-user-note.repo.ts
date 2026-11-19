import { eq, inArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";

export function normaliseUserNote(note: string): string | null {
  return note.trim() === "" ? null : note;
}

export async function setKnowledgeBitUserNote(
  id: string,
  note: string,
  db: DbExecutor = getDb(),
): Promise<{ userNote: string | null } | null> {
  const userNote = normaliseUserNote(note);

  const rows = await db
    .update(knowledgeBits)
    .set({ userNote })
    .where(eq(knowledgeBits.id, id))
    .returning({ id: knowledgeBits.id });

  return rows.length === 0 ? null : { userNote };
}

export async function readUserNotes(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];

  if (unique.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ id: knowledgeBits.id, userNote: knowledgeBits.userNote })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, unique));

  return new Map(
    rows.flatMap((row) => (row.userNote?.trim() ? [[row.id, row.userNote] as [string, string]] : [])),
  );
}

export async function attachUserNotes<T extends { knowledgeBitId: string }>(
  cards: T[],
  db: DbExecutor = getDb(),
): Promise<Array<T & { userNote: string | null }>> {
  const notes = await readUserNotes(
    cards.map((card) => card.knowledgeBitId),
    db,
  );

  return cards.map((card) => ({ ...card, userNote: notes.get(card.knowledgeBitId) ?? null }));
}
