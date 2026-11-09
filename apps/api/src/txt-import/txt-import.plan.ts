import { createHash } from "node:crypto";
import { KNOWLEDGE_SOURCE_MAX_CHARS } from "@post-anki/shared";
import { parseAnkiExport } from "../../../anki-batch-mcp/src/anki-export-parser.js";
import { buildStagedNotes, type StagedNoteRow } from "../anki-import/anki-import-staging.js";

export const MAX_TXT_FILE_CHARS = 900_000;

const ANKI_HEADER = /^#(separator|html|columns|deck|notetype|guid column|tags column|notetype column|deck column)\b/;

export type TxtImportRefusal =
  | "empty_file"
  | "not_text"
  | "file_too_large"
  | "text_too_long"
  | "no_notes"
  | "too_many_notes"
  | "unmapped_deck"
  | "invalid_notes";

export type TxtImportPlan =
  | { kind: "anki"; importId: string; rows: StagedNoteRow[]; parsed: number; skippedEmpty: number }
  | { kind: "single"; importKey: string; text: string }
  | { kind: "refused"; reason: TxtImportRefusal };

export const TXT_IMPORT_MESSAGES: Record<TxtImportRefusal, string> = {
  empty_file: "The file is empty.",
  not_text: "This does not look like a plain text file.",
  file_too_large: "The file is too large to upload.",
  text_too_long: "The text is too long to add as one source. Split it into smaller files.",
  no_notes: "No notes were found in this Anki export.",
  too_many_notes: "This Anki export has too many notes for one import.",
  unmapped_deck: "Some notes belong to decks the import does not know yet.",
  invalid_notes: "Some notes in this Anki export are too long or malformed.",
};

function shortHash(text: string, length: number): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

export function isAnkiExportText(text: string): boolean {
  return ANKI_HEADER.test(text.replace(/^﻿/, ""));
}

export function planTxtImport(rawText: string): TxtImportPlan {
  const text = rawText.replace(/^﻿/, "");

  if (text.includes("\u0000")) return { kind: "refused", reason: "not_text" };

  if (text.length > MAX_TXT_FILE_CHARS) return { kind: "refused", reason: "file_too_large" };

  if (text.trim() === "") return { kind: "refused", reason: "empty_file" };

  if (!isAnkiExportText(text)) {
    const trimmed = text.trim();

    if (trimmed.length > KNOWLEDGE_SOURCE_MAX_CHARS) return { kind: "refused", reason: "text_too_long" };

    return { kind: "single", importKey: `txt:${shortHash(trimmed, 16)}`, text: trimmed };
  }

  const parsed = parseAnkiExport(text);

  if (parsed.notes.length === 0) return { kind: "refused", reason: "no_notes" };

  const outcome = buildStagedNotes(parsed.notes);

  if (!outcome.ok) return { kind: "refused", reason: outcome.error };

  return {
    kind: "anki",
    importId: `txt-${shortHash(text, 12)}`,
    rows: outcome.rows,
    parsed: parsed.notes.length,
    skippedEmpty: outcome.skippedEmptyHashes.length,
  };
}
