import { and, desc, eq, sql } from "drizzle-orm";
import { CHAT_QUEUE_SEARCH_LIMIT, type ChatQueueSearchResponse } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits } from "../db/schema.js";

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildSnippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(flat.length, (at < 0 ? 0 : at) + query.length + SNIPPET_AFTER);

  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export async function searchChatQueueMessages(
  query: string,
  db: DbExecutor = getDb(),
): Promise<ChatQueueSearchResponse> {
  const rows = await db
    .select({
      cardId: knowledgeBitChatMessages.knowledgeBitId,
      seq: knowledgeBitChatMessages.seq,
      role: knowledgeBitChatMessages.role,
      text: knowledgeBitChatMessages.text,
    })
    .from(knowledgeBitChatMessages)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitChatMessages.knowledgeBitId))
    .where(
      and(
        eq(knowledgeBits.approvalState, "chat"),
        sql`${knowledgeBitChatMessages.text} ILIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`,
      ),
    )
    .orderBy(desc(knowledgeBitChatMessages.createdAt), desc(knowledgeBitChatMessages.id))
    .limit(CHAT_QUEUE_SEARCH_LIMIT + 1);

  return {
    results: rows
      .slice(0, CHAT_QUEUE_SEARCH_LIMIT)
      .map(({ text, ...row }) => ({ ...row, snippet: buildSnippet(text, query) })),
    hasMore: rows.length > CHAT_QUEUE_SEARCH_LIMIT,
  };
}
