import { and, eq } from "drizzle-orm";
import type { CreateCardFromChatMessageInput } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitChatMessages, knowledgeBits } from "../db/schema.js";
import { insertPendingManualItem } from "./knowledge-bit-manual-item.repo.js";

export type CreateCardFromChatMessageOutcome =
  | { ok: true; id: string }
  | { ok: false; error: "not_found" | "not_in_chat" | "not_assistant_message" };

export async function insertCardFromChatMessage(
  bitId: string,
  seq: number,
  input: CreateCardFromChatMessageInput,
  db: DbExecutor = getDb(),
): Promise<CreateCardFromChatMessageOutcome> {
  return db.transaction(async (tx) => {
    const [bit] = await tx
      .select({ sourceId: knowledgeBits.knowledgeSourceId, approvalState: knowledgeBits.approvalState })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, bitId))
      .for("update");

    if (!bit) {
      return { ok: false as const, error: "not_found" as const };
    }

    if (bit.approvalState !== "chat" && bit.approvalState !== "approved") {
      return { ok: false as const, error: "not_in_chat" as const };
    }

    const [message] = await tx
      .select({ role: knowledgeBitChatMessages.role })
      .from(knowledgeBitChatMessages)
      .where(and(eq(knowledgeBitChatMessages.knowledgeBitId, bitId), eq(knowledgeBitChatMessages.seq, seq)));

    if (!message) {
      return { ok: false as const, error: "not_found" as const };
    }

    if (message.role !== "assistant") {
      return { ok: false as const, error: "not_assistant_message" as const };
    }

    const { approve, ...card } = input;

    if (approve) {
      const [existing] = await tx
        .select({ id: knowledgeBits.id })
        .from(knowledgeBits)
        .where(
          and(
            eq(knowledgeBits.knowledgeSourceId, bit.sourceId),
            eq(knowledgeBits.approvalState, "approved"),
            eq(knowledgeBits.body, `${card.front}\n${card.back}`),
          ),
        )
        .limit(1);

      if (existing) {
        return { ok: true as const, id: existing.id };
      }
    }

    const item = await insertPendingManualItem(tx, bit.sourceId, { ...card, aiGenerated: true });

    if (approve) {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "approved", decidedAt: new Date() })
        .where(eq(knowledgeBits.id, item.id));
    }

    return { ok: true as const, id: item.id };
  });
}
