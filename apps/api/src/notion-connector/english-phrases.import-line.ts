import { log } from "../shared/log.js";
import type { EnglishPhrasesDeps, EnglishPhrasesOptions, EnglishPhrasesResult } from "./english-phrases.types.js";
import { isNotionAccessError, NotionAccessError } from "./notion-access.error.js";
import { phraseKey, type PhraseBlock } from "./phrase-key.js";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function removeLine(
  deps: EnglishPhrasesDeps,
  logId: string,
  block: PhraseBlock,
  result: EnglishPhrasesResult,
): Promise<void> {
  try {
    await deps.deleteBlock(block.id);
  } catch (err) {
    result.deleteFailed += 1;
    await deps.markDeleted(logId, null, messageOf(err)).catch(() => undefined);

    if (isNotionAccessError(err)) {
      throw new NotionAccessError(err);
    }

    log.warn({ err, connector: result.connector, notionBlockId: block.id }, "notion_phrase_delete_failed");

    return;
  }

  result.deleted += 1;
  await deps.markDeleted(logId, deps.now(), null).catch((err) => {
    log.warn({ err, connector: result.connector, notionBlockId: block.id }, "notion_phrase_mark_deleted_failed");
  });
}

function countOutcome(result: EnglishPhrasesResult, existingSourceId: string | undefined, created: boolean): void {
  if (existingSourceId) {
    result.duplicates += 1;
  } else if (created) {
    result.filed += 1;
  } else {
    result.alreadyPresent += 1;
  }
}

export async function importLine(
  deps: EnglishPhrasesDeps,
  options: EnglishPhrasesOptions,
  block: PhraseBlock,
  result: EnglishPhrasesResult,
  existingSourceId?: string,
): Promise<string | null> {
  let logId: string;
  let sourceId: string;
  let created = false;

  try {
    if (existingSourceId) {
      sourceId = existingSourceId;
    } else {
      const filed = await deps.fileNote(phraseKey(block.id), block.text);

      sourceId = filed.sourceId;
      created = filed.created;
    }

    logId = await deps.logImport({
      connector: options.connector,
      notionBlockId: block.id,
      originalText: block.text,
      knowledgeSourceId: sourceId,
    });
    countOutcome(result, existingSourceId, created);
  } catch (err) {
    result.failed += 1;
    log.error({ err, connector: options.connector, notionBlockId: block.id }, "notion_phrase_import_failed");

    return null;
  }

  if (options.deleteAfterImport) {
    await removeLine(deps, logId, block, result);
  }

  return sourceId;
}
