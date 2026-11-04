import { and, count, eq, lt, min } from "drizzle-orm";
import type { StaleChatQueueSummary } from "@post-anki/shared";
import { notSnoozed } from "./knowledge-bit-chat-queue.repo.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export async function getStaleChatQueueSummary(
  cutoff: Date,
  db: DbExecutor = getDb(),
): Promise<StaleChatQueueSummary> {
  const row = (
    await db
      .select({ value: count(), oldest: min(knowledgeBits.chatAt) })
      .from(knowledgeBits)
      .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(and(eq(knowledgeBits.approvalState, "chat"), lt(knowledgeBits.chatAt, cutoff), notSnoozed()))
  )[0];

  return { count: row?.value ?? 0, oldestChatAt: row?.oldest ? new Date(row.oldest).toISOString() : null };
}
