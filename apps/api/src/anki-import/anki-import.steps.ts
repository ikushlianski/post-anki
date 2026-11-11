import { NonRetriableError } from "inngest";
import type { DeckSubjectResolution } from "../mcp/business-deck-mapping.js";
import type { KeyedKnowledgeSourceItem, KeyedSourceRef } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import type { ImportStatusCounts, StoredImportNote } from "./anki-import.repo.js";
import { ankiNoteTextKey } from "./anki-note-text-key.js";
import { BATCH_SIZE, MAX_IMPORT_NOTES } from "./anki-import.limits.js";

export interface AnkiImportDeps {
  isDurableEnabled: () => boolean;
  countByStatus: (importId: string) => Promise<ImportStatusCounts>;
  listStagedDecks: (importId: string) => Promise<string[]>;
  takeNext: (importId: string, limit: number) => Promise<StoredImportNote[]>;
  resolveDeck: (deck: string) => Promise<DeckSubjectResolution>;
  insertKeyed: (items: KeyedKnowledgeSourceItem[], subjectId: string) => Promise<unknown[]>;
  findSources: (keys: string[]) => Promise<KeyedSourceRef[]>;
  findTakenTextKeys: (textKeys: string[], ownImportKeys: string[]) => Promise<string[]>;
  markDuplicates: (ids: string[]) => Promise<void>;
  markImported: (entries: { id: string; sourceId: string }[]) => Promise<void>;
  kick: (sourceIds: string[]) => Promise<void>;
}

export interface ImportPlan {
  staged: number;
  batchCount: number;
}

export interface BatchOutcome {
  taken: number;
  created: number;
  alreadyPresent: number;
  duplicateSentences: number;
  kicked: number;
}

export async function planStep(importId: string, deps: AnkiImportDeps): Promise<ImportPlan> {
  if (!deps.isDurableEnabled()) {
    throw new NonRetriableError("durable_extraction_disabled");
  }

  const { staged } = await deps.countByStatus(importId);

  if (staged > MAX_IMPORT_NOTES) {
    throw new NonRetriableError("too_many_notes");
  }

  for (const deck of await deps.listStagedDecks(importId)) {
    const resolved = await deps.resolveDeck(deck);

    if ("error" in resolved) {
      throw new NonRetriableError(
        resolved.error === "unknown_deck" ? "unknown_deck" : `subject_missing:${resolved.subjectName ?? ""}`,
      );
    }
  }

  return { staged, batchCount: Math.ceil(staged / BATCH_SIZE) };
}

export async function importBatchStep(importId: string, deps: AnkiImportDeps): Promise<BatchOutcome> {
  const taken = await deps.takeNext(importId, BATCH_SIZE);
  const keyed = taken.map((note) => ({ note, textKey: ankiNoteTextKey(note.rawText) }));
  const takenElsewhere = new Set(
    await deps.findTakenTextKeys(
      keyed.map((entry) => entry.textKey),
      taken.map((note) => note.noteKey),
    ),
  );
  const seen = new Set<string>();
  const kept = keyed.filter((entry) => {
    if (takenElsewhere.has(entry.textKey) || seen.has(entry.textKey)) {
      return false;
    }

    seen.add(entry.textKey);

    return true;
  });
  const keptIds = new Set(kept.map((entry) => entry.note.id));
  const duplicateIds = taken.filter((note) => !keptIds.has(note.id)).map((note) => note.id);
  const notes = kept.map((entry) => entry.note);
  const textKeyByNoteKey = new Map(kept.map((entry) => [entry.note.noteKey, entry.textKey]));
  const byDeck = new Map<string, StoredImportNote[]>();

  for (const note of notes) {
    byDeck.set(note.deck, [...(byDeck.get(note.deck) ?? []), note]);
  }

  let created = 0;

  for (const [deck, deckNotes] of byDeck) {
    const resolved = await deps.resolveDeck(deck);

    if ("error" in resolved) {
      throw new NonRetriableError(resolved.error);
    }

    const items = deckNotes.map((note) => ({
      importKey: note.noteKey,
      rawText: note.rawText,
      textKey: textKeyByNoteKey.get(note.noteKey),
    }));

    created += (await deps.insertKeyed(items, resolved.subjectId)).length;
  }

  const sources = await deps.findSources(notes.map((note) => note.noteKey));
  const byKey = new Map(sources.map((source) => [source.importKey, source]));
  const entries = notes.flatMap((note) => {
    const source = byKey.get(note.noteKey);

    return source ? [{ id: note.id, sourceId: source.id }] : [];
  });

  if (entries.length !== notes.length) {
    throw new Error("anki_import_source_missing_after_insert");
  }

  const pendingIds = sources.filter((source) => source.status === "pending").map((source) => source.id);

  if (pendingIds.length > 0) {
    await deps.kick(pendingIds);
  }

  await deps.markImported(entries);
  await deps.markDuplicates(duplicateIds);

  return {
    taken: taken.length,
    created,
    alreadyPresent: notes.length - created,
    duplicateSentences: duplicateIds.length,
    kicked: pendingIds.length,
  };
}

export async function summaryStep(importId: string, deps: AnkiImportDeps): Promise<ImportStatusCounts> {
  return deps.countByStatus(importId);
}
