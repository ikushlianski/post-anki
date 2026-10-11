import { log } from "../shared/log.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { runKnowledgeBitSourceItems } from "../mastra/knowledge-bit-source-items.agent.js";
import {
  claimPendingKnowledgeSources,
  markKnowledgeSourceBitsDetected,
  markKnowledgeSourceFailed,
  resetStaleProcessingKnowledgeSources,
  type PendingKnowledgeSource,
} from "./knowledge-bit.repo.js";
import { chunkSourceText, SOURCE_CHUNK_MAX_CHARS } from "./knowledge-bit-source-chunking.js";
import {
  normalizeStatement,
  selectNewItems,
  validateSourceItems,
  type SourceItemDraft,
} from "./knowledge-bit-source-item-validation.js";
import {
  getSourceInsertState,
  insertSourceItemsForChunk,
  type InsertSourceItemsInput,
  type SourceInsertState,
} from "./knowledge-bit-source-items.repo.js";

export const DETECT_BITS_BATCH_CAP = 20;
export const MAX_SOURCE_CHARS = 50_000;
export const STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000;
export const CHUNK_MAX_CHARS = SOURCE_CHUNK_MAX_CHARS;
export const MAX_ITEMS_PER_CHUNK = 8;
export const MAX_ITEMS_PER_SOURCE = 40;
export const CHUNK_CONCURRENCY = 3;
export const ORDINAL_STRIDE_PER_CHUNK = 1000;

export interface GenerateItemsDeps {
  writeItems: (chunk: string, options: { modelId?: string }) => Promise<SourceItemDraft[]>;
  getInsertState: (sourceId: string) => Promise<SourceInsertState>;
  insertItems: (input: InsertSourceItemsInput) => Promise<number>;
  markDetected: (id: string, claimedAt: Date) => Promise<boolean>;
  markFailed: (id: string, reason: string, claimedAt: Date) => Promise<boolean>;
}

export function defaultGenerateItemsDeps(): GenerateItemsDeps {
  return {
    writeItems: runKnowledgeBitSourceItems,
    getInsertState: getSourceInsertState,
    insertItems: insertSourceItemsForChunk,
    markDetected: markKnowledgeSourceBitsDetected,
    markFailed: markKnowledgeSourceFailed,
  };
}

export interface GenerateItemsResult {
  status: "detected" | "failed";
  inserted: number;
  failureReason: string | null;
}

interface RunState {
  seenStatements: Set<string>;
  accepted: number;
  inserted: number;
  reclaimed: Error | null;
}

function truncateReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return message.slice(0, 200);
}

function rejectRawText(rawText: string | null): string | null {
  if (!rawText || rawText.trim().length === 0) {
    return "source_empty";
  }

  return rawText.length > MAX_SOURCE_CHARS ? "source_too_long" : null;
}

async function writeAndValidate(
  chunk: string,
  options: { modelId?: string },
  deps: GenerateItemsDeps,
): Promise<SourceItemDraft[]> {
  const first = await deps.writeItems(chunk, options);
  const firstResult = validateSourceItems(first, chunk);
  const needsRetry =
    firstResult.valid.length === 0 || firstResult.dropped.length * 2 >= first.length;

  if (!needsRetry) {
    return firstResult.valid;
  }

  log.warn({ dropped: firstResult.dropped, returned: first.length }, "knowledge_bit_source_items_retry");

  try {
    const second = await deps.writeItems(chunk, options);
    const secondResult = validateSourceItems(second, chunk);

    return secondResult.valid.length > firstResult.valid.length ? secondResult.valid : firstResult.valid;
  } catch (err) {
    if (firstResult.valid.length === 0) {
      throw err;
    }

    return firstResult.valid;
  }
}

async function processChunk(
  chunk: string,
  index: number,
  context: {
    source: PendingKnowledgeSource;
    options: { modelId?: string };
    firstOrdinal: number;
    state: RunState;
    deps: GenerateItemsDeps;
  },
): Promise<void> {
  const { source, options, firstOrdinal, state, deps } = context;

  if (state.reclaimed || state.accepted >= MAX_ITEMS_PER_SOURCE) {
    return;
  }

  const valid = await writeAndValidate(chunk, options, deps);

  if (valid.length === 0) {
    throw new Error("no_valid_items");
  }

  const items = selectNewItems(
    valid,
    state.seenStatements,
    Math.min(MAX_ITEMS_PER_CHUNK, MAX_ITEMS_PER_SOURCE - state.accepted),
  );

  state.accepted += items.length;

  if (items.length === 0) {
    return;
  }

  try {
    const insertedCount = await deps.insertItems({
      sourceId: source.id,
      claimedAt: source.claimedAt,
      firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
      items,
    });

    state.inserted += insertedCount;
  } catch (err) {
    if (err instanceof Error && err.message === "knowledge_source_reclaimed") {
      state.reclaimed = err;
    }

    throw err;
  }
}

export async function generateItemsForSource(
  source: PendingKnowledgeSource,
  options: { modelId?: string } = {},
  deps: GenerateItemsDeps = defaultGenerateItemsDeps(),
): Promise<GenerateItemsResult> {
  const rawText = source.rawText;

  const rejection = rejectRawText(rawText);

  if (rejection || !rawText) {
    const reason = rejection ?? "source_empty";

    await deps.markFailed(source.id, reason, source.claimedAt);

    return { status: "failed", inserted: 0, failureReason: reason };
  }

  const insertState = await deps.getInsertState(source.id);
  const state: RunState = {
    seenStatements: new Set(insertState.existingStatements.map(normalizeStatement)),
    accepted: 0,
    inserted: 0,
    reclaimed: null,
  };
  const chunks = chunkSourceText(rawText, CHUNK_MAX_CHARS).map((chunk, index) => ({ chunk, index }));

  const outcomes = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, ({ chunk, index }) =>
    processChunk(chunk, index, {
      source,
      options,
      firstOrdinal: insertState.nextOrdinal,
      state,
      deps,
    }),
  );

  if (state.reclaimed) {
    throw state.reclaimed;
  }

  const failure = outcomes.find((outcome) => outcome.status === "rejected");

  if (failure?.status === "rejected") {
    log.error(
      { err: failure.reason, knowledgeSourceId: source.id },
      "knowledge_bit_source_items_chunk_failed",
    );

    const reason = truncateReason(failure.reason);

    await deps.markFailed(source.id, reason, source.claimedAt);

    return { status: "failed", inserted: state.inserted, failureReason: reason };
  }

  const stillOwned = await deps.markDetected(source.id, source.claimedAt);

  if (!stillOwned) {
    throw new Error("knowledge_source_reclaimed");
  }

  return { status: "detected", inserted: state.inserted, failureReason: null };
}

export interface DetectKnowledgeBitsDeps {
  claim: (limit: number) => Promise<PendingKnowledgeSource[]>;
  generate: (source: PendingKnowledgeSource) => Promise<GenerateItemsResult>;
  markFailed: (id: string, reason: string, claimedAt: Date) => Promise<boolean>;
  resetStale: (staleAfterMs: number) => Promise<number>;
}

export function defaultDetectKnowledgeBitsDeps(): DetectKnowledgeBitsDeps {
  return {
    claim: claimPendingKnowledgeSources,
    generate: (source) => generateItemsForSource(source),
    markFailed: markKnowledgeSourceFailed,
    resetStale: resetStaleProcessingKnowledgeSources,
  };
}

export interface DetectKnowledgeBitsResult {
  processed: number;
  detected: number;
  failed: number;
}

async function generateOrFail(
  source: PendingKnowledgeSource,
  deps: DetectKnowledgeBitsDeps,
): Promise<"detected" | "failed"> {
  try {
    return (await deps.generate(source)).status;
  } catch (err) {
    log.error({ err, knowledgeSourceId: source.id }, "knowledge_bit_detection_failed");

    try {
      await deps.markFailed(source.id, truncateReason(err), source.claimedAt);
    } catch (markErr) {
      log.error({ err: markErr, knowledgeSourceId: source.id }, "knowledge_bit_detection_mark_failed_errored");
    }

    return "failed";
  }
}

export async function detectKnowledgeBits(
  deps: DetectKnowledgeBitsDeps = defaultDetectKnowledgeBitsDeps(),
): Promise<DetectKnowledgeBitsResult> {
  const result: DetectKnowledgeBitsResult = { processed: 0, detected: 0, failed: 0 };

  await deps.resetStale(STALE_PROCESSING_THRESHOLD_MS);

  while (result.processed < DETECT_BITS_BATCH_CAP) {
    const claimed = await deps.claim(1);
    const source = claimed[0];

    if (!source) {
      break;
    }

    result.processed += 1;

    const outcome = await generateOrFail(source, deps);

    result[outcome] += 1;
  }

  log.info(result, "knowledge_bit_detection_batch_done");

  return result;
}
