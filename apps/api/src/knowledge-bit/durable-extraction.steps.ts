import { DURABLE_CHUNK_DEADLINE_MS } from "./durable-extraction.config.js";
import { isImportedClozeSource } from "./knowledge-bit-cloze-import.js";
import { chunkSourceText, chunkSourceTextWithOffsets } from "./knowledge-bit-source-chunking.js";
import { planFocusedChunks } from "./knowledge-bit-focus.js";
import {
  CHUNK_MAX_CHARS,
  MAX_ITEMS_PER_CHUNK,
  MAX_ITEMS_PER_SOURCE,
  ORDINAL_STRIDE_PER_CHUNK,
  allChunksDeliberatelyEmpty,
  chooseModelId,
  countUnseenStatements,
  loadFeedbackBlockSafely,
  loadStyleNotesBlockSafely,
  rejectRawText,
  truncateReason,
  writeAndValidate,
  type ChunkCards,
  type GenerateItemsDeps,
  type WriteOptions,
} from "./detect-knowledge-bits.orchestrator.js";
import {
  normalizeStatement,
  selectNewItems,
} from "./knowledge-bit-source-item-validation.js";
import { firstGapText, openAskAiChatSafely, replyAskAiChatSafely } from "./ask-ai-extraction.js";
import { selectFlaggedLessons } from "./knowledge-bit-flagged-lesson.js";
import { loadLearningIntentSafely } from "./knowledge-bit-learning-intent.js";
import { loadDetailLevelSafely } from "./knowledge-bit-detail-level.js";
import { resolveFusionModelIds } from "./knowledge-bit-fusion-settings.js";
import { resolveSubjectKind } from "../subject/subject-kind.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

// Everything a step takes or returns is stored by the engine. Source text, chunk text and
// feedback text never travel between steps: steps read them from the application tables.
export interface DurableSourceSnapshot {
  id: string;
  extractionModelId: string | null;
  subjectId: string | null;
  claimedAt: string;
}

export interface DurableExtractionInput {
  sourceId: string;
  regeneration: boolean;
}

export type DurablePlan =
  | { status: "failed"; reason: string }
  | { status: "ready"; chunkCount: number; firstOrdinal: number };

export interface DurableOutcome {
  status: "detected" | "failed" | "skipped";
  inserted: number;
  failureReason: string | null;
}

export interface DurableStepDeps extends GenerateItemsDeps {
  claimOrLoad: (
    sourceId: string,
    options: { regeneration: boolean; workflowId: string },
  ) => Promise<PendingKnowledgeSource | null>;
  loadRawText: (sourceId: string) => Promise<string | null>;
}

export function toSnapshot(source: PendingKnowledgeSource): DurableSourceSnapshot {
  return {
    id: source.id,
    extractionModelId: source.extractionModelId,
    subjectId: source.subjectId,
    claimedAt: source.claimedAt.toISOString(),
  };
}

function asPending(snapshot: DurableSourceSnapshot): PendingKnowledgeSource {
  return { ...snapshot, rawText: null, claimedAt: new Date(snapshot.claimedAt) };
}

export async function claimStep(
  input: DurableExtractionInput,
  workflowId: string,
  deps: DurableStepDeps,
): Promise<DurableSourceSnapshot | null> {
  const source = await deps.claimOrLoad(input.sourceId, { regeneration: input.regeneration, workflowId });

  return source ? toSnapshot(source) : null;
}

export async function planStep(snapshot: DurableSourceSnapshot, deps: DurableStepDeps): Promise<DurablePlan> {
  const rawText = await deps.loadRawText(snapshot.id);
  const rejection = rejectRawText(rawText);

  if (rejection || !rawText) {
    return { status: "failed", reason: rejection ?? "source_empty" };
  }

  const insertState = await deps.getInsertState(snapshot.id);

  const ankiImport = await deps.loadIsAnkiImport?.(snapshot.id);
  const chunkCount = chunkSourceText(rawText, CHUNK_MAX_CHARS).length;

  return {
    status: "ready",
    chunkCount: ankiImport && isImportedClozeSource(rawText) ? 1 : chunkCount,
    firstOrdinal: insertState.nextOrdinal,
  };
}

async function writeOptionsFor(snapshot: DurableSourceSnapshot, deps: DurableStepDeps): Promise<WriteOptions> {
  const modelId = chooseModelId(snapshot.extractionModelId, snapshot.id);
  const feedbackBlock = await loadFeedbackBlockSafely(asPending(snapshot), deps);
  const styleNotesBlock = await loadStyleNotesBlockSafely(asPending(snapshot), deps);

  const learningIntent = await loadLearningIntentSafely(snapshot.subjectId, snapshot.id, deps.loadLearningIntent);

  const subjectKind = await (deps.loadSubjectKind ?? resolveSubjectKind)(snapshot.subjectId);

  const sourceKind = await deps.loadSourceKind?.(snapshot.id);

  const ankiImport = await deps.loadIsAnkiImport?.(snapshot.id);

  const targetPhrases = await deps.loadTargetPhrases?.(snapshot.id);

  const detailLevel = await loadDetailLevelSafely(snapshot.subjectId, deps.loadDetailLevel);

  const fusionModelIds = snapshot.extractionModelId
    ? []
    : await resolveFusionModelIds(deps.loadFusionModelIds, snapshot.id);

  return {
    learningIntent,
    subjectKind,
    ...(sourceKind ? { sourceKind } : {}),
    ...(ankiImport ? { ankiImport } : {}),
    ...(targetPhrases && targetPhrases.length > 0 ? { targetPhrases } : {}),
    ...(detailLevel ? { detailLevel } : {}),
    ...(fusionModelIds.length > 0 ? { fusionModelIds } : {}),
    ...(modelId ? { modelId } : {}),
    ...(feedbackBlock ? { feedbackBlock } : {}),
    ...(styleNotesBlock ? { styleNotesBlock } : {}),
    abortSignal: AbortSignal.timeout(DURABLE_CHUNK_DEADLINE_MS),
  };
}

export async function chunkStep(
  snapshot: DurableSourceSnapshot,
  index: number,
  deps: DurableStepDeps,
): Promise<ChunkCards> {
  const rawText = await deps.loadRawText(snapshot.id);
  const highlights = await deps.loadHighlights?.(snapshot.id);
  const planned = rawText
    ? planFocusedChunks(chunkSourceTextWithOffsets(rawText, CHUNK_MAX_CHARS), highlights)
    : [];
  const entry = planned.find((candidate) => candidate.index === index);

  if (entry === undefined) {
    const total = rawText ? chunkSourceText(rawText, CHUNK_MAX_CHARS).length : 0;

    if (index < total && highlights && highlights.length > 0) {
      return { valid: [], flagged: [], deliberateEmpty: true };
    }

    throw new Error("source_chunk_missing");
  }

  const options = await writeOptionsFor(snapshot, deps);
  const cards = await writeAndValidate(
    entry.chunk,
    entry.focus.length > 0 ? { ...options, focus: entry.focus } : options,
    deps,
  );

  if (cards.deliberateEmpty) {
    return cards;
  }

  if (cards.valid.length === 0 && cards.flagged.length === 0 && !cards.gapText) {
    throw new Error("no_valid_items");
  }

  return cards;
}

export async function failStep(
  snapshot: DurableSourceSnapshot,
  reason: string,
  deps: GenerateItemsDeps,
): Promise<DurableOutcome> {
  await deps.markFailed(snapshot.id, reason, new Date(snapshot.claimedAt));

  return { status: "failed", inserted: 0, failureReason: reason };
}

export async function finishStep(
  snapshot: DurableSourceSnapshot,
  firstOrdinal: number,
  chunkResults: readonly (ChunkCards | null)[],
  failureReason: string | null,
  deps: GenerateItemsDeps,
): Promise<DurableOutcome> {
  const claimedAt = new Date(snapshot.claimedAt);
  const insertState = await deps.getInsertState(snapshot.id);
  const seen = new Set(insertState.existingStatements.map(normalizeStatement));
  let accepted = 0;
  let inserted = 0;
  let capped = false;

  for (const [index, cards] of chunkResults.entries()) {
    if (cards && accepted >= MAX_ITEMS_PER_SOURCE && countUnseenStatements(cards.valid, seen) > 0) {
      capped = true;
    }

    if (!cards || (accepted >= MAX_ITEMS_PER_SOURCE && cards.flagged.length === 0)) {
      continue;
    }

    const unseen = countUnseenStatements(cards.valid, seen);

    const flagged = selectFlaggedLessons(cards.flagged, seen);
    const items = selectNewItems(
      cards.valid,
      seen,
      Math.max(0, Math.min(MAX_ITEMS_PER_CHUNK, MAX_ITEMS_PER_SOURCE - accepted)),
    );

    accepted += items.length;

    if (accepted >= MAX_ITEMS_PER_SOURCE && unseen > items.length) {
      capped = true;
    }

    if (items.length > 0 || flagged.length > 0) {
      inserted += await deps.insertItems({
        sourceId: snapshot.id,
        claimedAt,
        firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
        items,
        flagged,
      });
    }
  }

  if (failureReason) {
    await deps.markFailed(snapshot.id, failureReason, claimedAt);

    return { status: "failed", inserted, failureReason };
  }

  const askAiChat = await openAskAiChatSafely(
    snapshot.id,
    firstGapText(chunkResults.map((cards) => cards?.gapText)),
    deps,
  );
  const stillOwned = await markDetectedFor(
    snapshot,
    claimedAt,
    inserted === 0 && !askAiChat && allChunksDeliberatelyEmpty(chunkResults),
    deps,
    capped,
  );

  if (!stillOwned) {
    throw new Error("knowledge_source_reclaimed");
  }

  await replyAskAiChatSafely(askAiChat);

  return { status: "detected", inserted, failureReason: null };
}

export function markDetectedFor(
  snapshot: DurableSourceSnapshot,
  claimedAt: Date,
  nothingExtracted: boolean,
  deps: GenerateItemsDeps,
  capped = false,
): Promise<boolean> {
  if (nothingExtracted && deps.markNothingExtracted) {
    return deps.markNothingExtracted(snapshot.id, claimedAt);
  }

  if (capped && deps.markItemCapReached) {
    return deps.markItemCapReached(snapshot.id, claimedAt);
  }

  return deps.markDetected(snapshot.id, claimedAt);
}

export function reasonOf(err: unknown): string {
  return truncateReason(err);
}
