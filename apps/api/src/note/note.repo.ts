import { and, desc, eq, sql } from "drizzle-orm";
import type { CaptureNoteInput, Note, NoteNodeType } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { notes } from "../db/schema.js";
import { newId } from "../shared/id.js";

export function rowToNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    nodeType: row.nodeType as NoteNodeType,
    nodeId: row.nodeId,
    body: row.body,
    isHighlight: row.isHighlight,
    concern: row.concern as Note["concern"],
    lastSurfacedAt: row.lastSurfacedAt ? row.lastSurfacedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function insertNote(input: CaptureNoteInput): Promise<Note> {
  const id = newId("note");
  const now = new Date();

  await getDb()
    .insert(notes)
    .values({
      id,
      nodeType: input.nodeType,
      nodeId: input.nodeId,
      body: input.body,
      isHighlight: input.isHighlight ?? false,
      concern: input.concern ?? null,
      searchVector: sql`to_tsvector('english', ${input.body})`,
      createdAt: now,
      updatedAt: now,
    });

  return {
    id,
    nodeType: input.nodeType,
    nodeId: input.nodeId,
    body: input.body,
    isHighlight: input.isHighlight ?? false,
    concern: input.concern ?? null,
    lastSurfacedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function listNotesForNode(
  nodeType: NoteNodeType,
  nodeId: string,
): Promise<Note[]> {
  const rows = await getDb()
    .select()
    .from(notes)
    .where(and(eq(notes.nodeType, nodeType), eq(notes.nodeId, nodeId)))
    .orderBy(desc(notes.createdAt));

  return rows.map(rowToNote);
}

export async function listNotesForReviewPool(): Promise<Note[]> {
  const rows = await getDb().select().from(notes);

  return rows.map(rowToNote);
}

export async function markNoteSurfaced(noteId: string, now: Date): Promise<void> {
  await getDb().update(notes).set({ lastSurfacedAt: now }).where(eq(notes.id, noteId));
}
