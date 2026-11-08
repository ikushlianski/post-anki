import { isSafeSourceUrl } from "@post-anki/core";
import { eq, max } from "drizzle-orm";
import {
  parseCloze,
  stripClozeMarkers,
  type ClozeError,
  type CreateClozeKnowledgeItemInput,
  type CreateKnowledgeItemInput,
  type CreateManualKnowledgeItemInput,
  type PendingKnowledgeBitForReview,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { clozeVariantRows } from "./knowledge-bit-cloze-rows.js";

export type InsertManualKnowledgeItemResult =
  | { ok: true; item: PendingKnowledgeBitForReview }
  | { ok: false; error: "not_found" | "already_running" | "entry_processed" }
  | InsertClozeItemError;

export type InsertDerivedKnowledgeItemResult =
  | { ok: true; item: PendingKnowledgeBitForReview }
  | { ok: false; error: "not_found" | "not_approved" };

export type Tx = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];

export type InsertClozeItemError = { ok: false; error: "invalid_cloze"; reason: ClozeError };

async function nextOrdinal(tx: Tx, entryId: string): Promise<number> {
  const [maxRow] = await tx
    .select({ maxOrdinal: max(knowledgeBits.ordinal) })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.knowledgeSourceId, entryId));

  return (maxRow?.maxOrdinal ?? -1) + 1;
}

function safeLinks(input: { sourceLinks?: string[] | undefined }): string[] {
  return (input.sourceLinks ?? []).filter((url) => isSafeSourceUrl(url).allowed);
}

async function insertPendingClozeItem(
  tx: Tx,
  entryId: string,
  input: CreateClozeKnowledgeItemInput,
): Promise<PendingKnowledgeBitForReview | InsertClozeItemError> {
  const parsed = parseCloze(input.note);

  if (!parsed.ok) {
    return { ok: false, error: "invalid_cloze", reason: parsed.error };
  }

  const bitId = newId("kb");
  const stampedAt = new Date();
  const body = stripClozeMarkers(parsed.note);
  const isAiGenerated = input.aiGenerated ?? false;
  const sourceLinks = safeLinks(input);

  await tx.insert(knowledgeBits).values({
    id: bitId,
    knowledgeSourceId: entryId,
    ordinal: await nextOrdinal(tx, entryId),
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

  const rows = clozeVariantRows(bitId, input.note);

  await tx.insert(knowledgeBitQuestionVariants).values(rows);

  return {
    id: bitId,
    body,
    background: input.example ?? null,
    variants: rows.map((row) => ({
      id: row.id,
      kind: "cloze" as const,
      prompt: row.prompt,
      answer: row.answer,
      sentence: row.sentence,
    })),
    feedback: null,
    origin: "manual",
    isAiGenerated,
    sourceLinks,
  };
}

export async function insertPendingManualItem(
  tx: Tx,
  entryId: string,
  input: CreateManualKnowledgeItemInput,
): Promise<PendingKnowledgeBitForReview>;
export async function insertPendingManualItem(
  tx: Tx,
  entryId: string,
  input: CreateKnowledgeItemInput,
): Promise<PendingKnowledgeBitForReview | InsertClozeItemError>;
export async function insertPendingManualItem(
  tx: Tx,
  entryId: string,
  input: CreateKnowledgeItemInput,
): Promise<PendingKnowledgeBitForReview | InsertClozeItemError> {
  if ("note" in input) {
    return insertPendingClozeItem(tx, entryId, input);
  }

  const ordinal = await nextOrdinal(tx, entryId);
  const bitId = newId("kb");
  const variantId = newId("kbqv");
  const stampedAt = new Date();
  const body = `${input.front}\n${input.back}`;
  const isAiGenerated = input.aiGenerated ?? false;
  const sourceLinks = safeLinks(input);

  await tx.insert(knowledgeBits).values({
    id: bitId,
    knowledgeSourceId: entryId,
    ordinal,
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
  input: CreateKnowledgeItemInput,
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

    const created = await insertPendingManualItem(tx, entryId, input);

    if ("ok" in created) {
      return created;
    }

    return { ok: true as const, item: created };
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
