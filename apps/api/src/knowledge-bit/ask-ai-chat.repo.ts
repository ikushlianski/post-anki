import { and, asc, count, eq, gte, like, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits } from "../db/schema.js";

export const ASK_AI_BIT_ORDINAL = -1;

const ASK_AI_BIT_ID_PREFIX = "kbask_";

export function askAiBitId(sourceId: string): string {
  return `${ASK_AI_BIT_ID_PREFIX}${sourceId}`;
}

export async function insertAskAiChatBit(
  sourceId: string,
  gapText: string,
  db: DbExecutor = getDb(),
): Promise<{ id: string; created: boolean; active: boolean }> {
  const id = askAiBitId(sourceId);
  const stampedAt = new Date();
  const inserted = await db
    .insert(knowledgeBits)
    .values({
      id,
      knowledgeSourceId: sourceId,
      ordinal: ASK_AI_BIT_ORDINAL,
      body: gapText,
      approvalState: "chat",
      chatAt: stampedAt,
      whQuestionGeneratedAt: stampedAt,
      fillBlankGeneratedAt: stampedAt,
      basicCardGeneratedAt: stampedAt,
    })
    .onConflictDoNothing()
    .returning({ id: knowledgeBits.id });

  if (inserted.length > 0) {
    return { id, created: true, active: true };
  }

  const [existing] = await db
    .select({ approvalState: knowledgeBits.approvalState })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, id));

  return { id, created: false, active: existing?.approvalState === "chat" };
}

export async function countRecentAskAiChatBits(windowMs: number, db: DbExecutor = getDb()): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ value: count() })
    .from(knowledgeBits)
    .where(and(like(knowledgeBits.id, `${ASK_AI_BIT_ID_PREFIX}%`), gte(knowledgeBits.createdAt, since)));

  return row?.value ?? 0;
}

export interface HeldAskAiBit {
  id: string;
  knowledgeSourceId: string;
  body: string;
}

export async function listHeldAskAiBits(limit: number, db: DbExecutor = getDb()): Promise<HeldAskAiBit[]> {
  return db
    .select({ id: knowledgeBits.id, knowledgeSourceId: knowledgeBits.knowledgeSourceId, body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(
      and(
        like(knowledgeBits.id, `${ASK_AI_BIT_ID_PREFIX}%`),
        eq(knowledgeBits.approvalState, "chat"),
        sql`not exists (select 1 from ${knowledgeBitChatMessages} where ${knowledgeBitChatMessages.knowledgeBitId} = ${knowledgeBits.id})`,
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}
