import {
  countUnseenStatements,
  MAX_ITEMS_PER_CHUNK,
  MAX_ITEMS_PER_SOURCE,
  ORDINAL_STRIDE_PER_CHUNK,
} from "./detect-knowledge-bits.orchestrator.js";
import {
  chunkStep,
  markDetectedFor,
  type DurableOutcome,
  type DurableSourceSnapshot,
  type DurableStepDeps,
} from "./durable-extraction.steps.js";
import { selectFlaggedLessons } from "./knowledge-bit-flagged-lesson.js";
import { normalizeStatement, selectNewItems } from "./knowledge-bit-source-item-validation.js";

export interface ChunkCounts {
  accepted: number;
  inserted: number;
  deliberateEmpty?: boolean;
  capped?: boolean;
}

export async function chunkInsertStep(
  snapshot: DurableSourceSnapshot,
  index: number,
  firstOrdinal: number,
  acceptedSoFar: number,
  deps: DurableStepDeps,
): Promise<ChunkCounts> {
  const { valid, flagged: rejected, deliberateEmpty } = await chunkStep(snapshot, index, deps);

  if (deliberateEmpty) {
    return { accepted: 0, inserted: 0, deliberateEmpty: true };
  }

  const insertState = await deps.getInsertState(snapshot.id);
  const seen = new Set(insertState.existingStatements.map(normalizeStatement));
  const room = Math.min(MAX_ITEMS_PER_CHUNK, MAX_ITEMS_PER_SOURCE - acceptedSoFar);
  const flagged = selectFlaggedLessons(rejected, seen);
  const unseen = countUnseenStatements(valid, seen);
  const items = room > 0 ? selectNewItems(valid, seen, room) : [];
  const capped = acceptedSoFar + items.length >= MAX_ITEMS_PER_SOURCE && unseen > items.length;

  if (items.length === 0 && flagged.length === 0) {
    return { accepted: 0, inserted: 0, capped };
  }

  const inserted = await deps.insertItems({
    sourceId: snapshot.id,
    claimedAt: new Date(snapshot.claimedAt),
    firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
    items,
    flagged,
  });

  return { accepted: items.length, inserted, capped };
}

export async function finishCountsStep(
  snapshot: DurableSourceSnapshot,
  inserted: number,
  failureReason: string | null,
  deps: DurableStepDeps,
  nothingExtracted = false,
  capped = false,
): Promise<DurableOutcome> {
  const claimedAt = new Date(snapshot.claimedAt);

  if (failureReason) {
    await deps.markFailed(snapshot.id, failureReason, claimedAt);

    return { status: "failed", inserted, failureReason };
  }

  if (!(await markDetectedFor(snapshot, claimedAt, nothingExtracted && inserted === 0, deps, capped))) {
    throw new Error("knowledge_source_reclaimed");
  }

  return { status: "detected", inserted, failureReason: null };
}
