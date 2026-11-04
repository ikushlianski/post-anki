import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits, knowledgeSources, subjects } from "../db/schema.js";
import type { ChatExportCard } from "./knowledge-bit-chat-queue-export.markdown.js";

export interface ChatExportData {
  subjectName: string;
  cards: ChatExportCard[];
}

export async function loadChatExportData(
  subjectId: string,
  limit: number,
  db: DbExecutor = getDb(),
): Promise<ChatExportData | null> {
  const subject = (await db.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, subjectId)).limit(1))[0];

  if (!subject) {
    return null;
  }

  const bits = await db
    .select({ id: knowledgeBits.id, body: knowledgeBits.body, background: knowledgeBits.background })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(eq(knowledgeBits.approvalState, "chat"), eq(knowledgeSources.subjectId, subjectId)))
    .orderBy(desc(knowledgeBits.chatAt), desc(knowledgeBits.id))
    .limit(limit);

  const messages =
    bits.length === 0
      ? []
      : await db
          .select({
            bitId: knowledgeBitChatMessages.knowledgeBitId,
            role: knowledgeBitChatMessages.role,
            text: knowledgeBitChatMessages.text,
          })
          .from(knowledgeBitChatMessages)
          .where(
            inArray(
              knowledgeBitChatMessages.knowledgeBitId,
              bits.map((bit) => bit.id),
            ),
          )
          .orderBy(asc(knowledgeBitChatMessages.knowledgeBitId), asc(knowledgeBitChatMessages.seq));

  const cards = bits.map((bit) => ({
    body: bit.body,
    background: bit.background,
    messages: messages.filter((message) => message.bitId === bit.id).map(({ role, text }) => ({ role, text })),
  }));

  return { subjectName: subject.name, cards };
}
