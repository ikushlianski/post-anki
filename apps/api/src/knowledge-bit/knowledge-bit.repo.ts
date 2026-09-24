import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";

export async function insertKnowledgeBits(
  sourceId: string,
  bits: string[],
  db: DbExecutor = getDb(),
): Promise<void> {
  if (bits.length === 0) {
    return;
  }

  const rows = bits.map((body, ordinal) => ({
    id: newId("kb"),
    knowledgeSourceId: sourceId,
    ordinal,
    body,
  }));

  await db
    .insert(knowledgeBits)
    .values(rows)
    .onConflictDoNothing({ target: [knowledgeBits.knowledgeSourceId, knowledgeBits.ordinal] });
}

export interface PendingKnowledgeSource {
  id: string;
  rawText: string | null;
}

export async function claimPendingKnowledgeSources(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSource[]> {
  const candidates = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.status, "pending"))
    .limit(limit);

  const claimed: PendingKnowledgeSource[] = [];

  for (const candidate of candidates) {
    const rows = await db
      .update(knowledgeSources)
      .set({ status: "processing" })
      .where(and(eq(knowledgeSources.id, candidate.id), eq(knowledgeSources.status, "pending")))
      .returning({ id: knowledgeSources.id, rawText: knowledgeSources.rawText });

    const claimedRow = rows[0];

    if (claimedRow) {
      claimed.push(claimedRow);
    }
  }

  return claimed;
}

export async function markKnowledgeSourceFailed(
  id: string,
  reason: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason })
    .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "processing")));
}

export async function markKnowledgeSourceBitsDetected(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeSources)
    .set({ status: "bits_detected", failureReason: null })
    .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "processing")));
}

export async function insertKnowledgeBitsAndMarkDetected(
  sourceId: string,
  bits: string[],
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertKnowledgeBits(sourceId, bits, tx);
    await markKnowledgeSourceBitsDetected(sourceId, tx);
  });
}
