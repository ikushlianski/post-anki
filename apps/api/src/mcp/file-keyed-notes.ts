import { insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { kickSourcesAfterAdd } from "../knowledge-source/knowledge-source-kick.js";

export interface KeyedNote {
  key: string;
  text: string;
}

export interface FileKeyedNotesResult {
  created: number;
  alreadyPresent: number;
  sourceIds: string[];
}

export async function fileKeyedNotes(notes: KeyedNote[], subjectId: string): Promise<FileKeyedNotesResult> {
  const byKey = new Map<string, { importKey: string; rawText: string }>();

  for (const note of notes) {
    if (!byKey.has(note.key)) {
      byKey.set(note.key, { importKey: note.key, rawText: note.text });
    }
  }

  const inserted = await insertKeyedKnowledgeSources([...byKey.values()], subjectId);
  const sourceIds = inserted.map((row) => row.id);

  if (sourceIds.length > 0) {
    await kickSourcesAfterAdd(sourceIds);
  }

  return { created: inserted.length, alreadyPresent: notes.length - inserted.length, sourceIds };
}
