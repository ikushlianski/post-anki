import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { CardStyleNote, UpdateCardStyleNoteInput } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardStyleNotes, cardTriageSessions } from "../db/schema.js";
import { newId } from "../shared/id.js";

type NoteRow = typeof cardStyleNotes.$inferSelect;

export function toCardStyleNote(row: NoteRow): CardStyleNote {
  return {
    id: row.id,
    subjectId: row.subjectId,
    sessionId: row.sessionId,
    text: row.text,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

function scopeFilter(subjectId: string | null) {
  return subjectId === null
    ? isNull(cardStyleNotes.subjectId)
    : or(isNull(cardStyleNotes.subjectId), eq(cardStyleNotes.subjectId, subjectId));
}

export async function listActiveStyleNotes(
  subjectId: string | null,
  options: { enabledOnly?: boolean } = {},
  db: DbExecutor = getDb(),
): Promise<CardStyleNote[]> {
  const rows = await db
    .select()
    .from(cardStyleNotes)
    .where(
      and(
        isNull(cardStyleNotes.supersededAt),
        scopeFilter(subjectId),
        options.enabledOnly ? eq(cardStyleNotes.enabled, true) : undefined,
      ),
    )
    .orderBy(desc(cardStyleNotes.createdAt));

  return rows.map(toCardStyleNote);
}

export async function listAllActiveStyleNotes(db: DbExecutor = getDb()): Promise<CardStyleNote[]> {
  const rows = await db
    .select()
    .from(cardStyleNotes)
    .where(isNull(cardStyleNotes.supersededAt))
    .orderBy(desc(cardStyleNotes.createdAt));

  return rows.map(toCardStyleNote);
}

export async function listEnabledActiveStyleNotesByScope(db: DbExecutor = getDb()): Promise<CardStyleNote[]> {
  const rows = await db
    .select()
    .from(cardStyleNotes)
    .where(and(isNull(cardStyleNotes.supersededAt), eq(cardStyleNotes.enabled, true)))
    .orderBy(desc(cardStyleNotes.createdAt));

  return rows.map(toCardStyleNote);
}

export async function listStyleNotesForSession(sessionId: string, db: DbExecutor = getDb()): Promise<CardStyleNote[]> {
  const rows = await db
    .select()
    .from(cardStyleNotes)
    .where(and(eq(cardStyleNotes.sessionId, sessionId), isNull(cardStyleNotes.supersededAt)))
    .orderBy(desc(cardStyleNotes.createdAt));

  return rows.map(toCardStyleNote);
}

export interface NewStyleNote {
  text: string;
  subjectId: string | null;
}

// Atomically supersedes the enabled active notes the session could see, inserts the reconciled
// list and marks the session distilled.
export async function replaceActiveStyleNotes(
  sessionId: string,
  sessionSubjectId: string | null,
  notes: NewStyleNote[],
): Promise<CardStyleNote[]> {
  const now = new Date();

  return getDb().transaction(async (tx) => {
    const current = await tx
      .select({ id: cardStyleNotes.id })
      .from(cardStyleNotes)
      .where(
        and(isNull(cardStyleNotes.supersededAt), eq(cardStyleNotes.enabled, true), scopeFilter(sessionSubjectId)),
      );

    if (current.length > 0) {
      await tx
        .update(cardStyleNotes)
        .set({ supersededAt: now })
        .where(
          inArray(
            cardStyleNotes.id,
            current.map((row) => row.id),
          ),
        );
    }

    await tx.update(cardTriageSessions).set({ status: "distilled" }).where(eq(cardTriageSessions.id, sessionId));

    if (notes.length === 0) {
      return [];
    }

    const inserted = await tx
      .insert(cardStyleNotes)
      .values(
        notes.map((note) => ({
          id: newId("csn"),
          subjectId: note.subjectId,
          sessionId,
          text: note.text,
          createdAt: now,
        })),
      )
      .returning();

    return inserted.map(toCardStyleNote);
  });
}

export async function updateCardStyleNote(
  id: string,
  patch: UpdateCardStyleNoteInput,
  db: DbExecutor = getDb(),
): Promise<CardStyleNote | null> {
  const set: Partial<typeof cardStyleNotes.$inferInsert> = {};

  if (patch.text !== undefined) {
    set.text = patch.text;
  }

  if (patch.enabled !== undefined) {
    set.enabled = patch.enabled;
  }

  if (patch.subjectId !== undefined) {
    set.subjectId = patch.subjectId;
  }

  const [row] = await db
    .update(cardStyleNotes)
    .set(set)
    .where(and(eq(cardStyleNotes.id, id), isNull(cardStyleNotes.supersededAt)))
    .returning();

  return row ? toCardStyleNote(row) : null;
}
