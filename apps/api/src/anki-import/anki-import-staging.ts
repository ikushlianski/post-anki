import { z } from "zod";
import { resolveBusinessDeck } from "../mcp/business-deck-mapping.js";
import { MAX_IMPORT_NOTES, MAX_NOTE_TEXT_LENGTH } from "./anki-import.limits.js";

export interface ParsedNoteLike {
  hash: string;
  deck: string | null;
  rawText: string;
  oversized?: true;
}

export interface StagedNoteRow {
  noteKey: string;
  deck: string;
  rawText: string;
  position: number;
}

export type StagingOutcome =
  | { ok: true; rows: StagedNoteRow[]; skippedEmptyHashes: string[] }
  | { ok: false; error: "too_many_notes"; count: number }
  | { ok: false; error: "unmapped_deck"; hashes: string[] }
  | { ok: false; error: "invalid_notes"; hashes: string[] };

const stagedNoteSchema = z.object({
  noteKey: z.string().regex(/^anki:[a-f0-9]{16}$/),
  deck: z.string().trim().min(1),
  rawText: z.string().trim().min(1).max(MAX_NOTE_TEXT_LENGTH),
});

export function buildStagedNotes(notes: readonly ParsedNoteLike[]): StagingOutcome {
  if (notes.length > MAX_IMPORT_NOTES) {
    return { ok: false, error: "too_many_notes", count: notes.length };
  }

  const rows: StagedNoteRow[] = [];
  const skippedEmptyHashes: string[] = [];
  const unmapped: string[] = [];
  const invalid: string[] = [];

  notes.forEach((note, position) => {
    if (note.oversized) {
      invalid.push(note.hash);

      return;
    }

    if (note.rawText.trim() === "") {
      skippedEmptyHashes.push(note.hash);

      return;
    }

    if (note.deck === null || resolveBusinessDeck(note.deck) === null) {
      unmapped.push(note.hash);

      return;
    }

    const parsed = stagedNoteSchema.safeParse({
      noteKey: `anki:${note.hash}`,
      deck: note.deck,
      rawText: note.rawText,
    });

    if (!parsed.success) {
      invalid.push(note.hash);

      return;
    }

    rows.push({ ...parsed.data, position });
  });

  if (unmapped.length > 0) {
    return { ok: false, error: "unmapped_deck", hashes: unmapped };
  }

  if (invalid.length > 0) {
    return { ok: false, error: "invalid_notes", hashes: invalid };
  }

  return { ok: true, rows, skippedEmptyHashes };
}
