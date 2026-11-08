import { NonRetriableError } from "inngest";
import type { DeckSubjectResolution } from "../mcp/business-deck-mapping.js";
import type { KeyedKnowledgeSourceItem, KeyedSourceRef } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import type { ImportStatusCounts, StoredImportNote } from "./anki-import.repo.js";
import { BATCH_SIZE, MAX_IMPORT_NOTES } from "./anki-import.limits.js";

export interface AnkiImportDeps {
  isDurableEnabled: () => boolean;
  countByStatus: (importId: string) => Promise<ImportStatusCounts>;
  listStagedDecks: (importId: string) => Promise<string[]>;
  takeNext: (importId: string, limit: number) => Promise<StoredImportNote[]>;
  resolveDeck: (deck: string) => Promise<DeckSubjectResolution>;
  insertKeyed: (items: KeyedKnowledgeSourceItem[], subjectId: string) => Promise<unknown[]>;
  findSources: (keys: string[]) => Promise<KeyedSourceRef[]>;
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
  const notes = await deps.takeNext(importId, BATCH_SIZE);
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

    const items = deckNotes.map((note) => ({ importKey: note.noteKey, rawText: note.rawText }));

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

  return {
    taken: notes.length,
    created,
    alreadyPresent: notes.length - created,
    kicked: pendingIds.length,
  };
}

export async function summaryStep(importId: string, deps: AnkiImportDeps): Promise<ImportStatusCounts> {
  return deps.countByStatus(importId);
}
