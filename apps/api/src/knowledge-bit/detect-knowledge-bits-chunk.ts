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
  gapText?: string;
}

const DELIBERATE_EMPTY: ChunkCards = { valid: [], flagged: [], deliberateEmpty: true };

export function allChunksDeliberatelyEmpty(chunkResults: readonly (ChunkCards | null)[]): boolean {
  return chunkResults.length > 0 && chunkResults.every((cards) => cards?.deliberateEmpty === true);
}

interface ClarificationHolder {
  gapText?: string;
}

async function writeOnce(
  chunk: string,
  options: WriteOptions,
  deps: GenerateItemsDeps,
  clarification: ClarificationHolder,
): Promise<{ drafts: LessonDraft[]; deliberateEmpty: boolean }> {
  let deliberateEmpty = false;
  const drafts = await deps.writeItems(chunk, {
    ...options,
    onNothingWorthKeeping: () => {
      deliberateEmpty = true;
    },
    onClarification: (gapText) => {
      clarification.gapText ??= gapText;
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
  const { fusionModelIds, ankiImport: _ankiImport, webSearchBudget, ...single } = options;
  const cards = await writeCards(chunk, fusionModelIds, single, deps);
  const budget = webSearchBudget ?? 0;

  if (budget > 0 && deps.enrichItems && cards.valid.length > 0) {
    return { ...cards, valid: await deps.enrichItems(cards.valid, budget) };
  }

  return cards;
}

function writeCards(
  chunk: string,
  fusionModelIds: string[] | undefined,
  single: Omit<WriteOptions, "fusionModelIds" | "webSearchBudget" | "ankiImport">,
  deps: GenerateItemsDeps,
): Promise<ChunkCards> {
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
  const clarification: ClarificationHolder = {};
  const modelId = options.modelId ?? (await deps.loadDefaultModelId?.());
  const resolved = modelId ? { ...options, modelId } : options;
  const cards = stampModel(await writeAndValidateWith(chunk, resolved, deps, clarification), modelId);

  return clarification.gapText ? { ...cards, gapText: clarification.gapText } : cards;
}

function stampModel(cards: ChunkCards, modelId: string | undefined): ChunkCards {
  if (!modelId) {
    return cards;
  }

  const stamp = (lesson: LessonDraft): LessonDraft => ({ ...lesson, generatedByModelId: modelId });

  return {
    ...cards,
    valid: cards.valid.map(stamp),
    flagged: cards.flagged.map((entry) => ({ ...entry, lesson: stamp(entry.lesson) })),
  };
}

async function writeAndValidateWith(
  chunk: string,
  options: WriteOptions,
  deps: GenerateItemsDeps,
  clarification: ClarificationHolder,
): Promise<ChunkCards> {
  const { drafts: first, deliberateEmpty: firstEmpty } = await writeOnce(chunk, options, deps, clarification);

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
    const retried = await writeOnce(
      chunk,
      languageOnly ? { ...options, strictLanguage: true } : options,
      deps,
      clarification,
    );

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

  const { valid, flagged, deliberateEmpty, gapText } = await writeAndValidate(chunk, options, deps);

  if (gapText) {
    state.gapByChunk.set(index, gapText);
  }

  if (deliberateEmpty) {
    state.deliberateEmptyChunks += 1;

    return;
  }

  if (!hasCards({ valid, flagged })) {
    if (gapText) {
      return;
    }

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
    const outcome = { skippedCards: 0 };
    const insertedCount = await deps.insertItems({
      sourceId: source.id,
      claimedAt: source.claimedAt,
      firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
      items,
      flagged: flaggedItems,
      outcome,
    });

    state.inserted += insertedCount;

    if (insertedCount === 0 && outcome.skippedCards > 0) {
      state.deliberateEmptyChunks += 1;
    }
  } catch (err) {
    if (err instanceof Error && err.message === "knowledge_source_reclaimed") {
      state.reclaimed = err;
    }

    throw err;
  }
}
