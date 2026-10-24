import { isSafeSourceUrl } from "@post-anki/core";
import { eq, max } from "drizzle-orm";
import type { CreateManualKnowledgeItemInput, PendingKnowledgeBitForReview } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";

export type InsertManualKnowledgeItemResult =
  | { ok: true; item: PendingKnowledgeBitForReview }
  | { ok: false; error: "not_found" | "already_running" | "entry_processed" };

export type InsertDerivedKnowledgeItemResult =
  | { ok: true; item: PendingKnowledgeBitForReview }
  | { ok: false; error: "not_found" | "not_approved" };

type Tx = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];

async function insertPendingManualItem(
  tx: Tx,
  entryId: string,
  input: CreateManualKnowledgeItemInput,
): Promise<PendingKnowledgeBitForReview> {
  const [maxRow] = await tx
    .select({ maxOrdinal: max(knowledgeBits.ordinal) })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.knowledgeSourceId, entryId));

  const bitId = newId("kb");
  const variantId = newId("kbqv");
  const stampedAt = new Date();
  const body = `${input.front}\n${input.back}`;
  const isAiGenerated = input.aiGenerated ?? false;
  const sourceLinks = (input.sourceLinks ?? []).filter((url) => isSafeSourceUrl(url).allowed);

  await tx.insert(knowledgeBits).values({
    id: bitId,
    knowledgeSourceId: entryId,
    ordinal: (maxRow?.maxOrdinal ?? -1) + 1,
    body,
    background: input.example ?? null,
    approvalState: "pending",
    origin: "manual",
    isAiGenerated,
    sourceLinks: sourceLinks.length > 0 ? sourceLinks : null,
    whQuestionGeneratedAt: stampedAt,
    fillBlankGeneratedAt: stampedAt,
    basicCardGeneratedAt: stampedAt,
  });

  await tx.insert(knowledgeBitQuestionVariants).values({
    id: variantId,
    knowledgeBitId: bitId,
    kind: "basic",
    order: 0,
    prompt: input.front,
    answer: input.back,
  });

  return {
    id: bitId,
    body,
    background: input.example ?? null,
    variants: [{ id: variantId, kind: "basic", prompt: input.front, answer: input.back }],
    feedback: null,
    origin: "manual",
    isAiGenerated,
    sourceLinks,
  };
}

export async function insertManualKnowledgeItem(
  entryId: string,
  input: CreateManualKnowledgeItemInput,
  db: DbExecutor = getDb(),
): Promise<InsertManualKnowledgeItemResult> {
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select({
        id: knowledgeSources.id,
        status: knowledgeSources.status,
        processedAt: knowledgeSources.processedAt,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, entryId))
      .for("update");

    if (!entry) {
      return { ok: false as const, error: "not_found" as const };
    }

    if (entry.status === "processing") {
      return { ok: false as const, error: "already_running" as const };
    }

    if (entry.processedAt) {
      return { ok: false as const, error: "entry_processed" as const };
    }

    return { ok: true as const, item: await insertPendingManualItem(tx, entryId, input) };
  });
}

export async function insertDerivedKnowledgeItem(
  bitId: string,
  input: CreateManualKnowledgeItemInput,
  db: DbExecutor = getDb(),
): Promise<InsertDerivedKnowledgeItemResult> {
  return db.transaction(async (tx) => {
    const [bit] = await tx
      .select({
        knowledgeSourceId: knowledgeBits.knowledgeSourceId,
        approvalState: knowledgeBits.approvalState,
      })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, bitId));

    if (!bit) {
      return { ok: false as const, error: "not_found" as const };
    }

    if (bit.approvalState !== "approved") {
      return { ok: false as const, error: "not_approved" as const };
    }

    await tx
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, bit.knowledgeSourceId))
      .for("update");

    return { ok: true as const, item: await insertPendingManualItem(tx, bit.knowledgeSourceId, input) };
  });
}
