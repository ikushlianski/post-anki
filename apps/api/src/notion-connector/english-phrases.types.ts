import type { BlocksPage } from "./phrase-key.js";

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
  listBlocks: (parentId: string, cursor: string | null) => Promise<BlocksPage>;
  findExisting: (normalizedTexts: string[]) => Promise<Map<string, string>>;
  fileNote: (key: string, text: string) => Promise<FiledNote>;
  logImport: (entry: ImportLogEntry) => Promise<string>;
  markDeleted: (logId: string, at: Date | null, error: string | null) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  now: () => Date;
}

export interface EnglishPhrasesOptions {
  connector: string;
  pageId: string;
  maxWords: number;
  maxPhrases: number;
  recursive: boolean;
  deleteAfterImport: boolean;
  dryRun: boolean;
  visited?: Set<string>;
  maxBlocksScanned?: number;
}

export interface NoteCounts {
  imported: number;
  skipped: number;
  failed: number;
}

export interface EnglishPhrasesResult {
  connector: string;
  dryRun: boolean;
  importable: number;
  attempted: number;
  filed: number;
  alreadyPresent: number;
  duplicates: number;
  deleted: number;
  deleteFailed: number;
  failed: number;
  words: NoteCounts;
  phrases: NoteCounts;
  blocksScanned: number;
  scanLimitReached: boolean;
}

export function newResult(options: EnglishPhrasesOptions): EnglishPhrasesResult {
  return {
    connector: options.connector,
    dryRun: options.dryRun,
    importable: 0,
    attempted: 0,
    filed: 0,
    alreadyPresent: 0,
    duplicates: 0,
    deleted: 0,
    deleteFailed: 0,
    failed: 0,
    words: { imported: 0, skipped: 0, failed: 0 },
    phrases: { imported: 0, skipped: 0, failed: 0 },
    blocksScanned: 0,
    scanLimitReached: false,
  };
}
