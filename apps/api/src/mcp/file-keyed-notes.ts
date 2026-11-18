import { getDb } from "../db/client.js";
import { insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { kickSourcesAfterAdd } from "../knowledge-source/knowledge-source-kick.js";
import type { KnowledgeProvenance } from "./knowledge-provenance.js";

export interface KeyedNote {
  key: string;
  text: string;
}

export interface FileKeyedNotesResult {
  created: number;
  alreadyPresent: number;
  sourceIds: string[];
}

export async function fileKeyedNotes(
  notes: KeyedNote[],
  subjectId: string,
  provenance: KnowledgeProvenance = {},
): Promise<FileKeyedNotesResult> {
  const byKey = new Map<string, { importKey: string; rawText: string }>();

  for (const note of notes) {
    if (!byKey.has(note.key)) {
      byKey.set(note.key, { importKey: note.key, rawText: note.text });
    }
  }

  const inserted = await insertKeyedKnowledgeSources([...byKey.values()], subjectId, getDb(), {
    kind: provenance.sourceKind,
    origin: provenance.origin,
  });
  const sourceIds = inserted.map((row) => row.id);

  if (sourceIds.length > 0) {
    await kickSourcesAfterAdd(sourceIds);
  }

  return { created: inserted.length, alreadyPresent: notes.length - inserted.length, sourceIds };
}
