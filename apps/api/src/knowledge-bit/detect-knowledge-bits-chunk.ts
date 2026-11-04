import { FUSION_MIN_MODELS, KNOWLEDGE_SOURCE_MAX_ITEMS } from "@post-anki/shared";
import { log } from "../shared/log.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";
import { selectFlaggedLessons } from "./knowledge-bit-flagged-lesson.js";
import {
  normalizeStatement,
  selectNewItems,
  validateSourceItems,
  type FlaggedLesson,
  type LessonDraft,
  type SourceItemBatchValidation,
} from "./knowledge-bit-source-item-validation.js";
import { runFusion } from "./knowledge-bit-fusion-extraction.js";
import type { GenerateItemsDeps, RunState, WriteOptions } from "./detect-knowledge-bits.types.js";

export const MAX_ITEMS_PER_CHUNK = 8;
export const MAX_ITEMS_PER_SOURCE = KNOWLEDGE_SOURCE_MAX_ITEMS;
export const ORDINAL_STRIDE_PER_CHUNK = 1000;

function allDroppedForLanguage(result: { valid: unknown[]; dropped: string[] }): boolean {
  return result.valid.length === 0 && result.dropped.length > 0 && result.dropped.every((reason) => reason === "wrong_language");
}

export function countUnseenStatements(valid: readonly LessonDraft[], seen: ReadonlySet<string>): number {
  return valid.filter((lesson) => !seen.has(normalizeStatement(lesson.statement))).length;
}

export interface ChunkCards {
  valid: LessonDraft[];
  flagged: FlaggedLesson[];
  deliberateEmpty?: boolean;
}

const DELIBERATE_EMPTY: ChunkCards = { valid: [], flagged: [], deliberateEmpty: true };

export function allChunksDeliberatelyEmpty(chunkResults: readonly (ChunkCards | null)[]): boolean {
  return chunkResults.length > 0 && chunkResults.every((cards) => cards?.deliberateEmpty === true);
}

async function writeOnce(
  chunk: string,
  options: WriteOptions,
  deps: GenerateItemsDeps,
): Promise<{ drafts: LessonDraft[]; deliberateEmpty: boolean }> {
  let deliberateEmpty = false;
  const drafts = await deps.writeItems(chunk, {
    ...options,
    onNothingWorthKeeping: () => {
      deliberateEmpty = true;
    },
  });

  return { drafts, deliberateEmpty: deliberateEmpty && drafts.length === 0 };
}

function toChunkCards(result: SourceItemBatchValidation): ChunkCards {
  return { valid: result.valid, flagged: result.rejected };
}

function hasCards(cards: ChunkCards): boolean {
  return cards.valid.length > 0 || cards.flagged.length > 0;
}

function betterOf(first: ChunkCards, second: ChunkCards): ChunkCards {
  if (second.valid.length !== first.valid.length) {
    return second.valid.length > first.valid.length ? second : first;
  }

  return first.valid.length === 0 && second.flagged.length > first.flagged.length ? second : first;
}

export async function writeAndValidate(
  chunk: string,
  options: WriteOptions,
  deps: GenerateItemsDeps,
): Promise<ChunkCards> {
  const { fusionModelIds, ...single } = options;

  if (fusionModelIds && fusionModelIds.length >= FUSION_MIN_MODELS) {
    return runFusion(fusionModelIds, (modelId) => writeAndValidateOne(chunk, { ...single, modelId }, deps));
  }

  return writeAndValidateOne(chunk, single, deps);
}

async function writeAndValidateOne(
  chunk: string,
  options: WriteOptions,
  deps: GenerateItemsDeps,
): Promise<ChunkCards> {
  const { drafts: first, deliberateEmpty: firstEmpty } = await writeOnce(chunk, options, deps);

  if (firstEmpty) {
    return DELIBERATE_EMPTY;
  }

  const allowMixedScript = options.sourceKind === "phrase";
  const firstResult = validateSourceItems(first, chunk, allowMixedScript);
  const needsRetry =
    firstResult.valid.length === 0 || firstResult.dropped.length * 2 >= first.length;

  if (!needsRetry) {
    return toChunkCards(firstResult);
  }

  log.warn({ dropped: firstResult.dropped, returned: first.length }, "knowledge_bit_source_items_retry");

  const languageOnly = allDroppedForLanguage(firstResult);

  try {
    const retried = await writeOnce(chunk, languageOnly ? { ...options, strictLanguage: true } : options, deps);

    if (retried.deliberateEmpty && !hasCards(toChunkCards(firstResult))) {
      return DELIBERATE_EMPTY;
    }

    return betterOf(
      toChunkCards(firstResult),
      toChunkCards(validateSourceItems(retried.drafts, chunk, allowMixedScript)),
    );
  } catch (err) {
    if (!hasCards(toChunkCards(firstResult))) {
      throw err;
    }

    return toChunkCards(firstResult);
  }
}

export async function processChunk(
  chunk: string,
  index: number,
  context: {
    source: PendingKnowledgeSource;
    options: WriteOptions;
    firstOrdinal: number;
    state: RunState;
    deps: GenerateItemsDeps;
  },
): Promise<void> {
  const { source, options, firstOrdinal, state, deps } = context;

  if (state.reclaimed) {
    return;
  }

  if (state.accepted >= MAX_ITEMS_PER_SOURCE) {
    state.capped = true;

    return;
  }

  const { valid, flagged, deliberateEmpty } = await writeAndValidate(chunk, options, deps);

  if (deliberateEmpty) {
    state.deliberateEmptyChunks += 1;

    return;
  }

  if (!hasCards({ valid, flagged })) {
    throw new Error("no_valid_items");
  }

  const flaggedItems = selectFlaggedLessons(flagged, state.seenStatements);
  const unseen = countUnseenStatements(valid, state.seenStatements);
  const items = selectNewItems(
    valid,
    state.seenStatements,
    Math.min(MAX_ITEMS_PER_CHUNK, MAX_ITEMS_PER_SOURCE - state.accepted),
  );

  state.accepted += items.length;

  if (state.accepted >= MAX_ITEMS_PER_SOURCE && unseen > items.length) {
    state.capped = true;
  }

  if (items.length === 0 && flaggedItems.length === 0) {
    return;
  }

  try {
    const insertedCount = await deps.insertItems({
      sourceId: source.id,
      claimedAt: source.claimedAt,
      firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
      items,
      flagged: flaggedItems,
    });

    state.inserted += insertedCount;
  } catch (err) {
    if (err instanceof Error && err.message === "knowledge_source_reclaimed") {
      state.reclaimed = err;
    }

    throw err;
  }
}
