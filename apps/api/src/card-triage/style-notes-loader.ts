import { eq, inArray } from "drizzle-orm";
import type { CardStyleNote } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import { log } from "../shared/log.js";
import { listActiveStyleNotes, listEnabledActiveStyleNotesByScope } from "./card-style-note.repo.js";
import { buildStyleNotesBlock } from "./style-notes-block.js";

export async function loadStyleNotesBlock(subjectId: string | null): Promise<string> {
  return buildStyleNotesBlock(await listActiveStyleNotes(subjectId, { enabledOnly: true }));
}

export async function loadStyleNotesBlockSafely(subjectId: string | null): Promise<string> {
  try {
    return await loadStyleNotesBlock(subjectId);
  } catch (err) {
    log.warn({ err }, "card_style_notes_load_failed");

    return "";
  }
}

async function subjectIdsForBits(bitIds: string[]): Promise<Map<string, string | null>> {
  const rows = await getDb()
    .select({ bitId: knowledgeBits.id, subjectId: knowledgeSources.subjectId })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(inArray(knowledgeBits.id, bitIds));

  return new Map(rows.map((row) => [row.bitId, row.subjectId]));
}

function blockForSubject(notes: CardStyleNote[], subjectId: string | null): string {
  return buildStyleNotesBlock(notes.filter((note) => note.subjectId === null || note.subjectId === subjectId));
}

// One notes query and one bit-subject query per scan; a bit without notes maps to "".
export async function loadStyleNotesBlocksForBits(bitIds: string[]): Promise<Map<string, string>> {
  const blocks = new Map<string, string>();

  if (bitIds.length === 0) {
    return blocks;
  }

  try {
    const notes = await listEnabledActiveStyleNotesByScope();

    if (notes.length === 0) {
      return blocks;
    }

    const subjects = await subjectIdsForBits(bitIds);
    const perSubject = new Map<string | null, string>();

    for (const bitId of bitIds) {
      const subjectId = subjects.get(bitId) ?? null;

      if (!perSubject.has(subjectId)) {
        perSubject.set(subjectId, blockForSubject(notes, subjectId));
      }

      blocks.set(bitId, perSubject.get(subjectId) ?? "");
    }
  } catch (err) {
    log.warn({ err }, "card_style_notes_load_failed");
  }

  return blocks;
}
