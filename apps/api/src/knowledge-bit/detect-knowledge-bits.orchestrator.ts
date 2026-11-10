import { KNOWLEDGE_SOURCE_MAX_CHARS, resolveUsableKnowledgeItemModelId } from "@post-anki/shared";
import { enrichImportedItems, importEnrichBudget } from "./knowledge-bit-import-enrichment.js";
import { importedFactText } from "./knowledge-bit-import-facts.js";
import { log } from "../shared/log.js";
import { loadRecentFeedbackForExtraction } from "./knowledge-bit-feedback.repo.js";
import { loadStyleNotesBlock } from "../card-triage/style-notes-loader.js";
import { buildReviewerFeedbackBlock } from "./knowledge-bit-review-feedback-block.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { runKnowledgeBitSourceItems } from "../mastra/knowledge-bit-source-items.agent.js";
import {
  claimPendingKnowledgeSources,
  markKnowledgeSourceBitsDetected,
  markKnowledgeSourceFailed,
  resetStaleProcessingKnowledgeSources,
  type PendingKnowledgeSource,
} from "./knowledge-bit.repo.js";
import { markKnowledgeSourceItemCapReached } from "./knowledge-source-item-cap.repo.js";
import { markKnowledgeSourceNothingExtracted } from "./knowledge-source-nothing-extracted.repo.js";
import { loadLearningIntentSafely, resolveKnowledgeBitLearningIntent } from "./knowledge-bit-learning-intent.js";
import { resolveSubjectKind } from "../subject/subject-kind.js";
import { getKnowledgeItemModelId } from "../admin-settings/admin-settings.repo.js";
import { loadFusionModelIds, resolveFusionModelIds } from "./knowledge-bit-fusion-settings.js";
import { loadHighlights, loadIsAnkiImport, loadTargetPhrases, loadKnowledgeSourceKind } from "./knowledge-source-kind.repo.js";
import { resolveDetailLevel } from "../subject/subject-learning-settings.js";
import { loadDetailLevelSafely } from "./knowledge-bit-detail-level.js";
import { chunkSourceTextWithOffsets, SOURCE_CHUNK_MAX_CHARS } from "./knowledge-bit-source-chunking.js";
import { planFocusedChunks } from "./knowledge-bit-focus.js";
import { normalizeStatement } from "./knowledge-bit-source-item-validation.js";
import { getSourceInsertState, insertSourceItemsForChunk } from "./knowledge-bit-source-items.repo.js";
import { processChunk } from "./detect-knowledge-bits-chunk.js";
import { firstGapByChunk, openAskAiChatSafely, replyAskAiChatSafely } from "./ask-ai-extraction.js";
import type {
  GenerateItemsDeps,
  GenerateItemsResult,
  RunState,
  WriteOptions,
} from "./detect-knowledge-bits.types.js";

export {
  allChunksDeliberatelyEmpty,
  countUnseenStatements,
  writeAndValidate,
  MAX_ITEMS_PER_CHUNK,
  MAX_ITEMS_PER_SOURCE,
  ORDINAL_STRIDE_PER_CHUNK,
  type ChunkCards,
} from "./detect-knowledge-bits-chunk.js";
export type {
  GenerateItemsDeps,
  GenerateItemsResult,
  WriteOptions,
} from "./detect-knowledge-bits.types.js";

export const DETECT_BITS_BATCH_CAP = 20;
export const MAX_SOURCE_CHARS = KNOWLEDGE_SOURCE_MAX_CHARS;
export const STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000;
export const CHUNK_MAX_CHARS = SOURCE_CHUNK_MAX_CHARS;
export const CHUNK_CONCURRENCY = 3;

export function defaultGenerateItemsDeps(): GenerateItemsDeps {
  return {
    writeItems: runKnowledgeBitSourceItems,
    enrichItems: enrichImportedItems,
    getInsertState: getSourceInsertState,
    insertItems: insertSourceItemsForChunk,
    markDetected: markKnowledgeSourceBitsDetected,
    markNothingExtracted: markKnowledgeSourceNothingExtracted,
    markItemCapReached: markKnowledgeSourceItemCapReached,
    markFailed: markKnowledgeSourceFailed,
    loadFeedbackBlock: async (subjectId) =>
      buildReviewerFeedbackBlock(await loadRecentFeedbackForExtraction(subjectId)),
    loadStyleNotesBlock,
    loadLearningIntent: resolveKnowledgeBitLearningIntent,
    loadSubjectKind: resolveSubjectKind,
    loadSourceKind: loadKnowledgeSourceKind,
    loadIsAnkiImport,
    loadTargetPhrases,
    loadHighlights,
    loadDetailLevel: resolveDetailLevel,
    loadFusionModelIds,
    loadDefaultModelId: getKnowledgeItemModelId,
    openAskAiChat: async (sourceId, gapText) =>
      (await import("./ask-ai-chat.orchestrator.js")).openAskAiChat(sourceId, gapText),
  };
}

function pickMarkDone(nothingExtracted: boolean, capped: boolean, deps: GenerateItemsDeps) {
  if (nothingExtracted && deps.markNothingExtracted) {
    return deps.markNothingExtracted;
  }

  return capped && deps.markItemCapReached ? deps.markItemCapReached : deps.markDetected;
}

export function truncateReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return message.slice(0, 200);
}

export function rejectRawText(rawText: string | null): string | null {
  if (!rawText || rawText.trim().length === 0) {
    return "source_empty";
  }

  return rawText.length > MAX_SOURCE_CHARS ? "source_too_long" : null;
}

export function chooseModelId(requested: string | null | undefined, sourceId: string): string | undefined {
  if (!requested) {
    return undefined;
  }

  const usable = resolveUsableKnowledgeItemModelId(requested);

  if (usable === null) {
    log.warn({ requested, knowledgeSourceId: sourceId }, "knowledge_item_model_unusable_fallback_default");
  }

  return usable ?? undefined;
}

export async function loadFeedbackBlockSafely(
  source: PendingKnowledgeSource,
  deps: GenerateItemsDeps,
): Promise<string> {
  try {
    return await deps.loadFeedbackBlock(source.subjectId);
  } catch (err) {
    log.warn({ err, knowledgeSourceId: source.id }, "knowledge_bit_feedback_load_failed");

    return "";
  }
}

export async function loadStyleNotesBlockSafely(
  source: PendingKnowledgeSource,
  deps: GenerateItemsDeps,
): Promise<string> {
  try {
    return (await deps.loadStyleNotesBlock?.(source.subjectId)) ?? "";
  } catch (err) {
    log.warn({ err, knowledgeSourceId: source.id }, "card_style_notes_load_failed");

    return "";
  }
}

async function loadOptionalSafely<T>(
  sourceId: string,
  event: string,
  load: ((sourceId: string) => Promise<T>) | undefined,
): Promise<T | undefined> {
  try {
    return await load?.(sourceId);
  } catch (err) {
    log.warn({ err, knowledgeSourceId: sourceId }, event);

    return undefined;
  }
}

export async function generateItemsForSource(
  source: PendingKnowledgeSource,
  requestedOptions: { modelId?: string; forceAtLeastOne?: boolean } = {},
  deps: GenerateItemsDeps = defaultGenerateItemsDeps(),
): Promise<GenerateItemsResult> {
  const modelId = chooseModelId(requestedOptions.modelId ?? source.extractionModelId, source.id);
  const feedbackBlock = await loadFeedbackBlockSafely(source, deps);
  const styleNotesBlock = await loadStyleNotesBlockSafely(source, deps);
  const learningIntent = await loadLearningIntentSafely(source.subjectId, source.id, deps.loadLearningIntent);
  const subjectKind = await (deps.loadSubjectKind ?? resolveSubjectKind)(source.subjectId);
  const sourceKind = await loadOptionalSafely(source.id, "knowledge_source_kind_load_failed", deps.loadSourceKind);
  const ankiImport = await loadOptionalSafely(source.id, "knowledge_source_anki_import_load_failed", deps.loadIsAnkiImport);
  const targetPhrases = await loadOptionalSafely(
    source.id,
    "knowledge_target_phrases_load_failed",
    deps.loadTargetPhrases,
  );
  const highlights = await loadOptionalSafely(source.id, "knowledge_highlights_load_failed", deps.loadHighlights);
  const detailLevel = await loadDetailLevelSafely(source.subjectId, deps.loadDetailLevel);
  const fusionModelIds =
    requestedOptions.modelId || source.extractionModelId
      ? []
      : await resolveFusionModelIds(deps.loadFusionModelIds, source.id);
  const options: WriteOptions = {
    learningIntent,
    subjectKind,
    ...(sourceKind ? { sourceKind } : {}),
    ...(ankiImport ? { ankiImport } : {}),
    ...(targetPhrases && targetPhrases.length > 0 ? { targetPhrases } : {}),
    ...(detailLevel ? { detailLevel } : {}),
    ...(fusionModelIds.length > 0 ? { fusionModelIds } : {}),
    ...(modelId ? { modelId } : {}),
    ...(requestedOptions.forceAtLeastOne ? { forceAtLeastOne: true } : {}),
    ...(feedbackBlock ? { feedbackBlock } : {}),
    ...(styleNotesBlock ? { styleNotesBlock } : {}),
  };
  const rawText = ankiImport && source.rawText ? importedFactText(source.rawText) : source.rawText;

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
    deliberateEmptyChunks: 0,
    capped: false,
    gapByChunk: new Map(),
  };
  const chunks = planFocusedChunks(chunkSourceTextWithOffsets(rawText, CHUNK_MAX_CHARS), highlights);

  const outcomes = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, ({ chunk, index, focus }) =>
    processChunk(chunk, index, {
      source,
      options: { ...options, ...(focus.length > 0 ? { focus } : {}), webSearchBudget: importEnrichBudget(ankiImport, index) },
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

  const askAiChat = await openAskAiChatSafely(source.id, firstGapByChunk(state.gapByChunk), deps);
  const nothingExtracted =
    state.inserted === 0 &&
    !askAiChat &&
    (chunks.length === 0 ? (highlights?.length ?? 0) > 0 : state.deliberateEmptyChunks === chunks.length);
  const markDone = pickMarkDone(nothingExtracted, state.capped, deps);
  const stillOwned = await markDone(source.id, source.claimedAt);

  if (!stillOwned) {
    throw new Error("knowledge_source_reclaimed");
  }

  await replyAskAiChatSafely(askAiChat);

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
