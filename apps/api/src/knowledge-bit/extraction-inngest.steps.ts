import {
  MAX_ITEMS_PER_CHUNK,
  MAX_ITEMS_PER_SOURCE,
  ORDINAL_STRIDE_PER_CHUNK,
} from "./detect-knowledge-bits.orchestrator.js";
import {
  chunkStep,
  type DurableOutcome,
  type DurableSourceSnapshot,
  type DurableStepDeps,
} from "./durable-extraction.steps.js";
import { normalizeStatement, selectNewItems } from "./knowledge-bit-source-item-validation.js";

export interface ChunkCounts {
  accepted: number;
  inserted: number;
}

export async function chunkInsertStep(
  snapshot: DurableSourceSnapshot,
  index: number,
  firstOrdinal: number,
  acceptedSoFar: number,
  deps: DurableStepDeps,
): Promise<ChunkCounts> {
  const valid = await chunkStep(snapshot, index, deps);
  const insertState = await deps.getInsertState(snapshot.id);
  const seen = new Set(insertState.existingStatements.map(normalizeStatement));
  const room = Math.min(MAX_ITEMS_PER_CHUNK, MAX_ITEMS_PER_SOURCE - acceptedSoFar);
  const items = room > 0 ? selectNewItems(valid, seen, room) : [];

  if (items.length === 0) {
    return { accepted: 0, inserted: 0 };
  }

  const inserted = await deps.insertItems({
    sourceId: snapshot.id,
    claimedAt: new Date(snapshot.claimedAt),
    firstOrdinal: firstOrdinal + index * ORDINAL_STRIDE_PER_CHUNK,
    items,
  });

  return { accepted: items.length, inserted };
}

export async function finishCountsStep(
  snapshot: DurableSourceSnapshot,
  inserted: number,
  failureReason: string | null,
  deps: DurableStepDeps,
): Promise<DurableOutcome> {
  const claimedAt = new Date(snapshot.claimedAt);

  if (failureReason) {
    await deps.markFailed(snapshot.id, failureReason, claimedAt);

    return { status: "failed", inserted, failureReason };
  }

  if (!(await deps.markDetected(snapshot.id, claimedAt))) {
    throw new Error("knowledge_source_reclaimed");
  }

  return { status: "detected", inserted, failureReason: null };
}
