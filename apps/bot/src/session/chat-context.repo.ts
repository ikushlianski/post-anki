import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { chatContext } from "../db/schema.js";

export type ChatMode = "idle" | "quiz" | "socratic";

export interface ChatContext {
  mode: ChatMode;
  sessionId: string | null;
  currentItemId: string | null;
  scopeKind: string | null;
  scopeId: string | null;
  navCurriculumId: string | null;
  label: string | null;
  messageId: number | null;
}

export async function getChatContext(
  chatId: number,
): Promise<ChatContext | null> {
  const rows = await getDb()
    .select()
    .from(chatContext)
    .where(eq(chatContext.chatId, String(chatId)));

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    mode: row.mode as ChatMode,
    sessionId: row.sessionId,
    currentItemId: row.currentItemId,
    scopeKind: row.scopeKind,
    scopeId: row.scopeId,
    navCurriculumId: row.navCurriculumId,
    label: row.label,
    messageId: row.messageId,
  };
}

export async function setChatContext(
  chatId: number,
  context: ChatContext,
): Promise<void> {
  const values = {
    chatId: String(chatId),
    mode: context.mode,
    sessionId: context.sessionId,
    currentItemId: context.currentItemId,
    scopeKind: context.scopeKind,
    scopeId: context.scopeId,
    navCurriculumId: context.navCurriculumId,
    label: context.label,
    messageId: context.messageId,
    updatedAt: new Date(),
  };

  await getDb()
    .insert(chatContext)
    .values(values)
    .onConflictDoUpdate({
      target: chatContext.chatId,
      set: {
        mode: values.mode,
        sessionId: values.sessionId,
        currentItemId: values.currentItemId,
        scopeKind: values.scopeKind,
        scopeId: values.scopeId,
        navCurriculumId: values.navCurriculumId,
        label: values.label,
        messageId: values.messageId,
        updatedAt: values.updatedAt,
      },
    });
}

export async function setNavCurriculum(
  chatId: number,
  curriculumId: string,
): Promise<void> {
  await getDb()
    .insert(chatContext)
    .values({
      chatId: String(chatId),
      mode: "idle",
      navCurriculumId: curriculumId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: chatContext.chatId,
      set: { navCurriculumId: curriculumId, updatedAt: new Date() },
    });
}

export async function clearChatContext(chatId: number): Promise<void> {
  await getDb()
    .update(chatContext)
    .set({ mode: "idle", sessionId: null, currentItemId: null, updatedAt: new Date() })
    .where(eq(chatContext.chatId, String(chatId)));
}
