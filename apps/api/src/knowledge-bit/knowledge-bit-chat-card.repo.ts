import { and, eq, isNull } from "drizzle-orm";
import { isOrderedListKind } from "@post-anki/shared";
import { knowledgeBitQuestionVariants, knowledgeBits } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { BODY_EDIT_RESET, detachDerivedBitData } from "./knowledge-bit-write.repo.js";
import { insertPendingManualItem, type Tx } from "./knowledge-bit-manual-item.repo.js";

export interface ChatCardContent {
  front: string;
  back: string;
  example?: string;
}

export async function insertApprovedChatCard(
  tx: Tx,
  sourceId: string,
  card: ChatCardContent,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: knowledgeBits.id })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.knowledgeSourceId, sourceId),
        eq(knowledgeBits.approvalState, "approved"),
        eq(knowledgeBits.body, `${card.front}\n${card.back}`),
      ),
    )
    .limit(1);

  if (existing) {
    return { id: existing.id, created: false };
  }

  const item = await insertPendingManualItem(
    tx,
    sourceId,
    { ...card, aiGenerated: true },
    { approvalState: "pending" },
    true,
  );

  if ("ok" in item) {
    throw new Error(item.error);
  }

  await tx
    .update(knowledgeBits)
    .set({ approvalState: "approved", decidedAt: new Date() })
    .where(eq(knowledgeBits.id, item.id));

  return { id: item.id, created: true };
}

export async function applyChatCardRevision(
  tx: Tx,
  bitId: string,
  card: ChatCardContent,
): Promise<{ ok: true } | { ok: false; error: "wrong_shape" }> {
  const active = await tx
    .select({
      id: knowledgeBitQuestionVariants.id,
      kind: knowledgeBitQuestionVariants.kind,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(eq(knowledgeBitQuestionVariants.knowledgeBitId, bitId), isNull(knowledgeBitQuestionVariants.supersededAt)),
    );

  if (active.some((row) => row.kind === "cloze" || isOrderedListKind(row.kind))) {
    return { ok: false, error: "wrong_shape" };
  }

  const stampedAt = new Date();

  await tx
    .update(knowledgeBits)
    .set({
      ...BODY_EDIT_RESET,
      body: `${card.front}\n${card.back}`,
      ...(card.example !== undefined ? { background: card.example, exampleAiGeneratedAt: null } : {}),
      whQuestionGeneratedAt: stampedAt,
      fillBlankGeneratedAt: stampedAt,
      basicCardGeneratedAt: stampedAt,
    })
    .where(eq(knowledgeBits.id, bitId));

  await detachDerivedBitData(tx, bitId);

  await tx.insert(knowledgeBitQuestionVariants).values({
    id: newId("kbqv"),
    knowledgeBitId: bitId,
    kind: "basic",
    order: 0,
    prompt: card.front,
    answer: card.back,
  });

  return { ok: true };
}

export async function getChatCardSourceId(tx: Tx, bitId: string): Promise<string | null> {
  const [row] = await tx
    .select({ sourceId: knowledgeBits.knowledgeSourceId })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, bitId));

  return row?.sourceId ?? null;
}
