import { eq } from "drizzle-orm";
import type { QuestionKind } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { pendingProbe } from "../db/schema.js";
import type { Pending } from "../conversation/flow-types.js";

export async function getPending(chatId: number): Promise<Pending | null> {
  const rows = await getDb()
    .select()
    .from(pendingProbe)
    .where(eq(pendingProbe.chatId, String(chatId)));

  const row = rows[0];

  return row
    ? { topicId: row.topicId, gapId: row.gapId, mode: row.mode as QuestionKind }
    : null;
}

export async function setPending(chatId: number, pending: Pending): Promise<void> {
  await getDb()
    .insert(pendingProbe)
    .values({
      chatId: String(chatId),
      topicId: pending.topicId,
      gapId: pending.gapId,
      mode: pending.mode,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pendingProbe.chatId,
      set: {
        topicId: pending.topicId,
        gapId: pending.gapId,
        mode: pending.mode,
        updatedAt: new Date(),
      },
    });
}

export async function clearPending(chatId: number): Promise<void> {
  await getDb().delete(pendingProbe).where(eq(pendingProbe.chatId, String(chatId)));
}
