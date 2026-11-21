import { log } from "../shared/log.js";
import { importLine } from "./english-phrases.import-line.js";
import type { EnglishPhrasesDeps, EnglishPhrasesOptions, EnglishPhrasesResult } from "./english-phrases.types.js";
import { isNotionAccessError, NotionAccessError } from "./notion-access.error.js";
import { classifyNote, normalizeNote } from "./note-text.js";
import { isImportable, type BlocksPage, type PhraseBlock } from "./phrase-key.js";

export const MAX_BLOCKS_SCANNED = 1500;
export const MAX_DEPTH = 5;

interface WalkState {
  deps: EnglishPhrasesDeps;
  options: EnglishPhrasesOptions;
  result: EnglishPhrasesResult;
  visited: Set<string>;
  known: Map<string, string>;
  remaining: { word: number; phrase: number };
  maxScanned: number;
}

function quotaFull(state: WalkState): boolean {
  return state.remaining.word <= 0 && state.remaining.phrase <= 0;
}

async function listOrAbort(state: WalkState, parentId: string, cursor: string | null): Promise<BlocksPage> {
  try {
    return await state.deps.listBlocks(parentId, cursor);
  } catch (err) {
    throw isNotionAccessError(err) ? new NotionAccessError(err) : err;
  }
}

async function descend(state: WalkState, parentId: string, depth: number): Promise<void> {
  try {
    await walk(state, parentId, depth);
  } catch (err) {
    if (err instanceof NotionAccessError) {
      throw err;
    }

    state.result.failed += 1;
    log.warn({ err, connector: state.options.connector, notionBlockId: parentId }, "notion_phrase_page_walk_failed");
  }
}

async function lookupKnown(state: WalkState, blocks: PhraseBlock[]): Promise<void> {
  const wanted = new Set<string>();

  for (const block of blocks) {
    const normalized = normalizeNote(block.text);

    if (normalized && !state.visited.has(block.id) && isImportable(block) && !state.known.has(normalized)) {
      wanted.add(normalized);
    }
  }

  if (wanted.size === 0) {
    return;
  }

  for (const [normalized, sourceId] of await state.deps.findExisting([...wanted])) {
    state.known.set(normalized, sourceId);
  }
}

async function handleNote(state: WalkState, block: PhraseBlock): Promise<void> {
  const { result, options } = state;
  const normalized = normalizeNote(block.text);
  const existing = normalized ? state.known.get(normalized) : undefined;

  if (existing) {
    if (options.dryRun) {
      result.duplicates += 1;
    } else {
      result.importable += 1;
      await importLine(state.deps, options, block, result, existing);
    }

    return;
  }

  result.importable += 1;

  const kind = classifyNote(block.text);
  const counts = kind === "word" ? result.words : result.phrases;

  if (state.remaining[kind] <= 0) {
    counts.skipped += 1;

    return;
  }

  state.remaining[kind] -= 1;

  if (options.dryRun) {
    counts.imported += 1;

    return;
  }

  result.attempted += 1;

  const sourceId = await importLine(state.deps, options, block, result);

  if (sourceId) {
    counts.imported += 1;

    if (normalized) {
      state.known.set(normalized, sourceId);
    }
  } else {
    counts.failed += 1;
  }
}

async function visit(state: WalkState, block: PhraseBlock, depth: number): Promise<void> {
  const canDescend = state.options.recursive && depth < MAX_DEPTH;

  if (block.type === "child_page") {
    if (canDescend) {
      await descend(state, block.id, depth + 1);
    }

    return;
  }

  if (block.type !== "bulleted_list_item") {
    return;
  }

  if (block.hasChildren) {
    if (canDescend) {
      await descend(state, block.id, depth + 1);
    }

    return;
  }

  if (isImportable(block)) {
    await handleNote(state, block);
  }
}

async function walk(state: WalkState, parentId: string, depth: number): Promise<void> {
  let cursor: string | null = null;

  do {
    if (quotaFull(state)) {
      return;
    }

    if (state.result.blocksScanned >= state.maxScanned) {
      state.result.scanLimitReached = true;

      return;
    }

    const page: BlocksPage = await listOrAbort(state, parentId, cursor);
    const room = state.maxScanned - state.result.blocksScanned;
    const blocks = page.blocks.slice(0, room);

    state.result.blocksScanned += blocks.length;
    state.result.scanLimitReached ||= blocks.length < page.blocks.length;
    await lookupKnown(state, blocks);

    for (const block of blocks) {
      if (quotaFull(state)) {
        return;
      }

      if (!state.visited.has(block.id)) {
        state.visited.add(block.id);
        await visit(state, block, depth);
      }
    }

    cursor = state.result.scanLimitReached ? null : page.nextCursor;
  } while (cursor);
}

export async function walkAndImport(
  deps: EnglishPhrasesDeps,
  options: EnglishPhrasesOptions,
  result: EnglishPhrasesResult,
): Promise<void> {
  const visited = options.visited ?? new Set<string>();

  if (visited.has(options.pageId)) {
    return;
  }

  visited.add(options.pageId);

  const state: WalkState = {
    deps,
    options,
    result,
    visited,
    known: new Map(),
    remaining: { word: options.maxWords, phrase: options.maxPhrases },
    maxScanned: options.maxBlocksScanned ?? MAX_BLOCKS_SCANNED,
  };

  await walk(state, options.pageId, 0);
}
