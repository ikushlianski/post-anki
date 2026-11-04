import { parsePhraseLines } from "@post-anki/core";
import type { CreatePhraseSourcesResult } from "@post-anki/shared";
import { kickSourcesAfterAdd } from "./knowledge-source-kick.js";
import { insertPhraseKnowledgeSources } from "./phrase-knowledge-source.repo.js";
import { formatPhraseSourceText } from "./phrase-source-text.js";

export interface ImportPhraseLinesResult extends CreatePhraseSourcesResult {
  importedKeys: string[];
}

export async function importPhraseLines(input: {
  lines: string[];
  subjectId: string;
}): Promise<ImportPhraseLinesResult> {
  const { phrases, ignored, duplicatesInInput } = parsePhraseLines(input.lines);
  const created = await insertPhraseKnowledgeSources(
    phrases.map((item) => ({ key: item.key, text: formatPhraseSourceText(item.phrase, item.hint, item.unsure) })),
    input.subjectId,
  );

  if (created.length > 0) {
    await kickSourcesAfterAdd(created.map((source) => source.id));
  }

  return {
    received: input.lines.length,
    imported: created.length,
    skippedExisting: phrases.length - created.length,
    ignored,
    duplicatesInInput,
    importedKeys: created.flatMap((source) => (source.importKey ? [source.importKey] : [])),
  };
}
