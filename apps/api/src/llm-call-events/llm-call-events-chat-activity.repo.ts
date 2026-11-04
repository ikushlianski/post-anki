import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { llmCallEvents } from "../db/schema.js";
import { CHAT_QUEUE_REPLY_OP } from "../knowledge-bit/knowledge-bit-chat-queue.service.js";

export interface ChatActivity {
  cards: number;
  turns: number;
}

export async function readChatActivity(
  from: Date,
  to: Date,
  db: DbExecutor = getDb(),
): Promise<ChatActivity> {
  const [row] = await db
    .select({
      cards: sql<number>`count(distinct ${llmCallEvents.knowledgeBitId})::int`,
      turns: sql<number>`count(*)::int`,
    })
    .from(llmCallEvents)
    .where(
      and(
        eq(llmCallEvents.op, CHAT_QUEUE_REPLY_OP),
        eq(llmCallEvents.success, true),
        gte(llmCallEvents.createdAt, from),
        lt(llmCallEvents.createdAt, to),
      ),
    );

  return { cards: row?.cards ?? 0, turns: row?.turns ?? 0 };
}
