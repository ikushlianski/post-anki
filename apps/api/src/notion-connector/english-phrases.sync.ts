import { log } from "../shared/log.js";
import { isImportable, phraseKey, type PhraseBlock } from "./phrase-key.js";

export interface FiledNote {
  sourceId: string;
  created: boolean;
}

export interface ImportLogEntry {
  connector: string;
  notionBlockId: string;
  originalText: string;
  knowledgeSourceId: string;
}

export interface EnglishPhrasesDeps {
  listBlocks: (pageId: string) => Promise<PhraseBlock[]>;
  fileNote: (key: string, text: string) => Promise<FiledNote>;
  logImport: (entry: ImportLogEntry) => Promise<string>;
  markDeleted: (logId: string, at: Date | null, error: string | null) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  now: () => Date;
}

export interface EnglishPhrasesOptions {
  connector: string;
  pageId: string;
  maxPerRun: number;
  deleteAfterImport: boolean;
  dryRun: boolean;
}

export interface EnglishPhrasesResult {
  connector: string;
  dryRun: boolean;
  importable: number;
  attempted: number;
  filed: number;
  alreadyPresent: number;
  deleted: number;
  deleteFailed: number;
  failed: number;
}

export const NOTION_ACCESS_HELP =
  "Notion denied access. The Notion integration behind NOTION_TOKEN needs the Read content and Update content capabilities, and the 'English Phrases 3' page must be shared with it with edit access.";

export class NotionAccessError extends Error {
  constructor(cause: unknown) {
    super(NOTION_ACCESS_HELP, { cause });
    this.name = "NotionAccessError";
  }
}

const ACCESS_CODES = new Set(["unauthorized", "restricted_resource"]);

export function isNotionAccessError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const { code, status } = err as { code?: unknown; status?: unknown };

  return (typeof code === "string" && ACCESS_CODES.has(code)) || status === 401 || status === 403;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function listOrAbort(deps: EnglishPhrasesDeps, pageId: string): Promise<PhraseBlock[]> {
  try {
    return await deps.listBlocks(pageId);
  } catch (err) {
    throw isNotionAccessError(err) ? new NotionAccessError(err) : err;
  }
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

async function importLine(
  deps: EnglishPhrasesDeps,
  options: EnglishPhrasesOptions,
  block: PhraseBlock,
  result: EnglishPhrasesResult,
): Promise<void> {
  let logId: string;

  try {
    const filed = await deps.fileNote(phraseKey(block.id), block.text);

    logId = await deps.logImport({
      connector: options.connector,
      notionBlockId: block.id,
      originalText: block.text,
      knowledgeSourceId: filed.sourceId,
    });
    result.filed += filed.created ? 1 : 0;
    result.alreadyPresent += filed.created ? 0 : 1;
  } catch (err) {
    result.failed += 1;
    log.error({ err, connector: options.connector, notionBlockId: block.id }, "notion_phrase_import_failed");

    return;
  }

  if (options.deleteAfterImport) {
    await removeLine(deps, logId, block, result);
  }
}

export async function importEnglishPhrases(
  deps: EnglishPhrasesDeps,
  options: EnglishPhrasesOptions,
): Promise<EnglishPhrasesResult> {
  const blocks = (await listOrAbort(deps, options.pageId)).filter(isImportable);
  const batch = blocks.slice(0, options.maxPerRun);
  const result: EnglishPhrasesResult = {
    connector: options.connector,
    dryRun: options.dryRun,
    importable: blocks.length,
    attempted: options.dryRun ? 0 : batch.length,
    filed: 0,
    alreadyPresent: 0,
    deleted: 0,
    deleteFailed: 0,
    failed: 0,
  };

  if (options.dryRun) {
    return result;
  }

  for (const block of batch) {
    await importLine(deps, options, block, result);
  }

  log.info(result, "notion_english_phrases_done");

  return result;
}
