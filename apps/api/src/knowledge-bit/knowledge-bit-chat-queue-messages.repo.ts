import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { CHAT_QUEUE_MAX_USER_TURNS, type ChatQueueMessage } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface StoredChatMessage extends ChatQueueMessage {
  clientMessageId: string | null;
}

export interface NewChatTurn {
  clientMessageId: string;
  userText: string;
  assistantText: string;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function deleteChatQueueMessages(db: DbExecutor, bitIds?: string[]): Promise<void> {
  if (bitIds === undefined) {
    await db.delete(knowledgeBitChatMessages);

    return;
  }

  if (bitIds.length === 0) {
    return;
  }

  await db.delete(knowledgeBitChatMessages).where(inArray(knowledgeBitChatMessages.knowledgeBitId, bitIds));
}

export async function deleteChatThreadsForCardsNotInChat(db: DbExecutor = getDb()): Promise<number> {
  const deleted = await db
    .delete(knowledgeBitChatMessages)
    .where(
      sql`not exists (select 1 from ${knowledgeBits} where ${knowledgeBits.id} = ${knowledgeBitChatMessages.knowledgeBitId} and ${knowledgeBits.approvalState} = 'chat')`,
    )
    .returning({ id: knowledgeBitChatMessages.id });

  return deleted.length;
}

export const CHAT_THREAD_RETENTION_DAYS = 30;

export async function deleteChatThreadsOfDecidedCards(
  now: Date = new Date(),
  db: DbExecutor = getDb(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_THREAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(knowledgeBitChatMessages)
    .where(
      sql`exists (select 1 from ${knowledgeBits} where ${knowledgeBits.id} = ${knowledgeBitChatMessages.knowledgeBitId} and ${knowledgeBits.approvalState} = 'rejected' and ${knowledgeBits.decidedAt} < ${cutoff})`,
    )
    .returning({ id: knowledgeBitChatMessages.id });

  return deleted.length;
}

export async function listChatQueueMessages(
  bitId: string,
  db: DbExecutor = getDb(),
): Promise<StoredChatMessage[]> {
  const rows = await db
    .select()
    .from(knowledgeBitChatMessages)
    .where(eq(knowledgeBitChatMessages.knowledgeBitId, bitId))
    .orderBy(asc(knowledgeBitChatMessages.seq));

  return rows.map((row) => ({
    seq: row.seq,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    clientMessageId: row.clientMessageId,
  }));
}

export function toPublicMessages(messages: StoredChatMessage[]): ChatQueueMessage[] {
  return messages.map(({ seq, role, text, createdAt }) => ({ seq, role, text, createdAt }));
}

export function turnsUsed(messages: ChatQueueMessage[]): number {
  return messages.filter((message) => message.role === "user").length;
}

export function turnsLeftFor(messages: ChatQueueMessage[]): number {
  return Math.max(0, CHAT_QUEUE_MAX_USER_TURNS - turnsUsed(messages));
}

export async function countChatQueueTurnsByBit(
  bitIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  if (bitIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ bitId: knowledgeBitChatMessages.knowledgeBitId, value: sql<number>`count(*)::int` })
    .from(knowledgeBitChatMessages)
    .where(
      sql`${inArray(knowledgeBitChatMessages.knowledgeBitId, bitIds)} and ${knowledgeBitChatMessages.role} = 'user'`,
    )
    .groupBy(knowledgeBitChatMessages.knowledgeBitId);

  return new Map(rows.map((row) => [row.bitId, row.value]));
}

export async function lastSeqOf(bitId: string, db: DbExecutor): Promise<number> {
  const row = (
    await db
      .select({ seq: knowledgeBitChatMessages.seq })
      .from(knowledgeBitChatMessages)
      .where(eq(knowledgeBitChatMessages.knowledgeBitId, bitId))
      .orderBy(desc(knowledgeBitChatMessages.seq))
      .limit(1)
  )[0];

  return row?.seq ?? 0;
}

export async function insertChatTurn(bitId: string, turn: NewChatTurn, db: DbExecutor): Promise<void> {
  const seq = await lastSeqOf(bitId, db);

  await db.insert(knowledgeBitChatMessages).values([
    {
      id: newId("kbcm"),
      knowledgeBitId: bitId,
      seq: seq + 1,
      role: "user",
      text: turn.userText,
      clientMessageId: turn.clientMessageId,
    },
    {
      id: newId("kbcm"),
      knowledgeBitId: bitId,
      seq: seq + 2,
      role: "assistant",
      text: turn.assistantText,
      modelId: turn.modelId,
      inputTokens: turn.inputTokens,
      outputTokens: turn.outputTokens,
    },
  ]);
}

export async function deleteLastChatExchange(bitId: string, db: DbExecutor): Promise<StoredChatMessage[] | null> {
  const messages = await listChatQueueMessages(bitId, db);
  const lastUser = messages.filter((message) => message.role === "user").at(-1);

  if (!lastUser) {
    return null;
  }

  await db
    .delete(knowledgeBitChatMessages)
    .where(and(eq(knowledgeBitChatMessages.knowledgeBitId, bitId), gte(knowledgeBitChatMessages.seq, lastUser.seq)));

  return messages.filter((message) => message.seq < lastUser.seq);
}
