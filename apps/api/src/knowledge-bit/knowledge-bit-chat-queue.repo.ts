import { and, count, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { CHAT_QUEUE_MAX_USER_TURNS, rejectReasonCodesForSubjectType, type ChatQueueKnowledgeBit } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { loadSubjectPathLabels } from "../subject/subject-path-labels.js";
import { loadSubjectKindRows, pickRejectSubjectType } from "../subject/reject-subject-type.js";
import { knowledgeSourceTitleSql } from "./knowledge-source-title.sql.js";
import { countChatQueueTurnsByBit, deleteChatQueueMessages } from "./knowledge-bit-chat-queue-messages.repo.js";

export type ChatQueueTransitionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "blocked" };

async function lockState(tx: DbExecutor, id: string): Promise<string | null> {
  const row = (
    await tx
      .select({ approvalState: knowledgeBits.approvalState })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, id))
      .for("update")
  )[0];

  return row?.approvalState ?? null;
}

const hasChatMessages = sql`exists (select 1 from ${knowledgeBitChatMessages} where ${knowledgeBitChatMessages.knowledgeBitId} = ${knowledgeBits.id})`;

export const inChatQueue = sql`(${knowledgeBits.approvalState} = 'chat' or (${knowledgeBits.approvalState} = 'approved' and ${hasChatMessages}))`;

const lastMessageAt = sql<string | null>`(select max(${knowledgeBitChatMessages.createdAt}) from ${knowledgeBitChatMessages} where ${knowledgeBitChatMessages.knowledgeBitId} = ${knowledgeBits.id})`;

const queueChatAt = sql<string | Date | null>`case when ${knowledgeBits.approvalState} = 'approved' then ${lastMessageAt} else ${knowledgeBits.chatAt} end`;

export function notSnoozed() {
  return or(isNull(knowledgeBits.chatSnoozedUntil), lte(knowledgeBits.chatSnoozedUntil, sql`now()`));
}

export async function snoozeChatQueueKnowledgeBit(
  id: string,
  until: Date | null,
  db: DbExecutor = getDb(),
): Promise<ChatQueueTransitionResult<string | null>> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "chat") {
      return { ok: false as const, reason: "blocked" as const };
    }

    await tx.update(knowledgeBits).set({ chatSnoozedUntil: until }).where(eq(knowledgeBits.id, id));

    return { ok: true as const, value: until ? until.toISOString() : null };
  });
}

export async function countChatQueueKnowledgeBits(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(inChatQueue, notSnoozed()));

  return rows[0]?.value ?? 0;
}

export async function countAllChatQueueKnowledgeBits(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(inChatQueue);

  return rows[0]?.value ?? 0;
}

export async function moveKnowledgeBitToChatQueue(
  id: string,
  db: DbExecutor = getDb(),
): Promise<ChatQueueTransitionResult<number>> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "pending" && state !== "inbox" && state !== "chat") {
      return { ok: false as const, reason: "blocked" as const };
    }

    if (state === "pending" || state === "inbox") {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "chat", chatAt: new Date(), inboxAt: null })
        .where(eq(knowledgeBits.id, id));
    }

    return { ok: true as const, value: await countChatQueueKnowledgeBits(tx) };
  });
}

export async function returnKnowledgeBitFromChatQueue(
  id: string,
  db: DbExecutor = getDb(),
): Promise<ChatQueueTransitionResult> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "pending" && state !== "chat" && state !== "approved") {
      return { ok: false as const, reason: "blocked" as const };
    }

    if (state === "approved") {
      await deleteChatQueueMessages(tx, [id]);
    }

    if (state === "chat") {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "pending", chatAt: null })
        .where(eq(knowledgeBits.id, id));
    }

    return { ok: true as const, value: undefined };
  });
}

export async function listChatQueueKnowledgeBits(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<ChatQueueKnowledgeBit[]> {
  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      background: knowledgeBits.background,
      origin: knowledgeBits.origin,
      subjectId: knowledgeSources.subjectId,
      sourceTitle: knowledgeSourceTitleSql,
      sourceUrl: knowledgeSources.sourceUrl,
      approvalState: knowledgeBits.approvalState,
      chatAt: queueChatAt,
      chatSnoozedUntil: knowledgeBits.chatSnoozedUntil,
      createdAt: knowledgeBits.createdAt,
    })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(inChatQueue)
    .orderBy(desc(queueChatAt), desc(knowledgeBits.id))
    .limit(limit);

  const turns = await countChatQueueTurnsByBit(
    rows.map((row) => row.id),
    db,
  );

  const subjectKindRows = await loadSubjectKindRows(db);
  const pathLabels = await loadSubjectPathLabels(db);

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    background: row.background,
    origin: row.origin ?? "extracted",
    subjectId: row.subjectId ?? null,
    subjectName: row.subjectId ? (pathLabels.get(row.subjectId) ?? null) : null,
    sourceTitle: row.origin === "manual" ? null : (row.sourceTitle ?? null),
    sourceUrl: row.origin === "manual" ? null : (row.sourceUrl ?? null),
    chatAt: (row.chatAt ? new Date(row.chatAt) : row.createdAt).toISOString(),
    reviewChat: row.approvalState === "approved",
    turnsLeft: Math.max(0, CHAT_QUEUE_MAX_USER_TURNS - (turns.get(row.id) ?? 0)),
    snoozedUntil:
      row.chatSnoozedUntil && row.chatSnoozedUntil.getTime() > Date.now()
        ? row.chatSnoozedUntil.toISOString()
        : null,
    rejectReasonCodes: [
      ...rejectReasonCodesForSubjectType(pickRejectSubjectType(row.subjectId ?? null, subjectKindRows)),
    ],
  }));
}

export interface ChatCardContext {
  body: string;
  background: string | null;
  approvalState: string;
  sourceText: string | null;
  sourceAuthor: string | null;
  sourceUrl: string | null;
}

export async function loadChatCardContext(id: string, db: DbExecutor = getDb()): Promise<ChatCardContext | null> {
  const row = (
    await db
      .select({
        body: knowledgeBits.body,
        background: knowledgeBits.background,
        approvalState: knowledgeBits.approvalState,
        sourceText: knowledgeSources.rawText,
        sourceAuthor: knowledgeSources.sourceAuthor,
        sourceUrl: knowledgeSources.sourceUrl,
      })
      .from(knowledgeBits)
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(eq(knowledgeBits.id, id))
      .limit(1)
  )[0];

  return row ?? null;
}

export async function lockChatState(tx: DbExecutor, id: string): Promise<string | null> {
  return lockState(tx, id);
}
