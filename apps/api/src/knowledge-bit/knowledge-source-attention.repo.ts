import { and, desc, eq, exists, isNull, notExists, notInArray, or } from "drizzle-orm";
import {
  ITEM_CAP_REACHED_REASON,
  attentionFirstWords,
  deriveAttentionKind,
  type KnowledgeSourceAttention,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export const ATTENTION_LIST_LIMIT = 200;

const liveBitOfSource = (db: DbExecutor) =>
  db
    .select({ id: knowledgeBits.id })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.knowledgeSourceId, knowledgeSources.id),
        notInArray(knowledgeBits.approvalState, ["superseded"]),
      ),
    );

export async function listSourcesNeedingAttention(
  limit: number = ATTENTION_LIST_LIMIT,
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<KnowledgeSourceAttention[]> {
  const rows = await db
    .select({
      id: knowledgeSources.id,
      status: knowledgeSources.status,
      failureReason: knowledgeSources.failureReason,
      updatedAt: knowledgeSources.updatedAt,
      rawText: knowledgeSources.rawText,
      processedAt: knowledgeSources.processedAt,
      nothingExtractedAt: knowledgeSources.nothingExtractedAt,
      hasLiveCard: exists(liveBitOfSource(db)),
    })
    .from(knowledgeSources)
    .where(
      or(
        eq(knowledgeSources.status, "failed"),
        eq(knowledgeSources.status, "processing"),
        and(
          eq(knowledgeSources.status, "bits_detected"),
          isNull(knowledgeSources.processedAt),
          notExists(liveBitOfSource(db)),
        ),
        and(
          eq(knowledgeSources.status, "bits_detected"),
          isNull(knowledgeSources.processedAt),
          eq(knowledgeSources.failureReason, ITEM_CAP_REACHED_REASON),
        ),
      ),
    )
    .orderBy(desc(knowledgeSources.updatedAt))
    .limit(limit);

  const entries: KnowledgeSourceAttention[] = [];

  for (const row of rows) {
    const kind = deriveAttentionKind({
      status: row.status,
      failureReason: row.failureReason,
      updatedAt: row.updatedAt,
      liveCardCount: row.hasLiveCard ? 1 : 0,
      processed: row.processedAt !== null,
      nothingExtractedAt: row.nothingExtractedAt,
      now,
    });

    if (kind === null) {
      continue;
    }

    entries.push({
      knowledgeSourceId: row.id,
      kind,
      reason: row.failureReason,
      firstWords: attentionFirstWords(row.rawText),
      sourceText: row.rawText,
      since: row.updatedAt.toISOString(),
    });
  }

  return entries;
}

export async function countSourcesNeedingAttention(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<number> {
  const entries = await listSourcesNeedingAttention(ATTENTION_LIST_LIMIT, now, db);

  return entries.filter((entry) => entry.kind !== "nothing_extracted").length;
}
