import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import {
  subjectCheckConfidenceSchema,
  type KnowledgeBitQuestionVariantKind,
  type PendingKnowledgeSourceForReview,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { findRejectionFeedbackId } from "./knowledge-bit-feedback.repo.js";
import { recordKnowledgeBitDecision } from "./knowledge-bit-feedback-decision.repo.js";

// Learner-facing read gate — every surface that lets a learner answer, chat with, search, or
// browse a knowledge bit must apply this, so a bit stays invisible until a human approves it.
export const bitApproved = eq(knowledgeBits.approvalState, "approved");

// Background-work gate — scans skip bits a human rejected or a regeneration superseded.
export const bitNotDiscarded = notInArray(knowledgeBits.approvalState, ["rejected", "superseded"]);

// A decision, once made, can't flip to the other decision — but retrying the same one (the
// panel keeps a row listed and lets the reviewer click again after a lost response) must still
// succeed, so only the cross-transition is blocked, not a repeat of the same outcome.
export type ApproveKnowledgeBitResult = true | "blocked" | "not_found" | "no_variant";

export async function approveKnowledgeBit(
  id: string,
  db: DbExecutor = getDb(),
): Promise<ApproveKnowledgeBitResult> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    if (!current) {
      return "not_found";
    }

    if (!["pending", "approved"].includes(current.approvalState)) {
      return "blocked";
    }

    if (current.approvalState === "pending") {
      const hasVariant = await tx
        .select({ one: knowledgeBitQuestionVariants.id })
        .from(knowledgeBitQuestionVariants)
        .where(
          and(
            eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
            isNull(knowledgeBitQuestionVariants.supersededAt),
          ),
        )
        .limit(1);

      if (hasVariant.length === 0) {
        return "no_variant";
      }

      await tx
        .update(knowledgeBits)
        .set({ approvalState: "approved", reviewFlag: null })
        .where(eq(knowledgeBits.id, id));
      await recordKnowledgeBitDecision(tx, { bitId: id, verdict: "approved" });
    }

    return true;
  });
}

export type RejectKnowledgeBitResult =
  | { ok: true; feedbackId: string | null }
  | { ok: false; reason: "blocked" | "not_found" };

export async function rejectKnowledgeBit(
  id: string,
  db: DbExecutor = getDb(),
): Promise<RejectKnowledgeBitResult> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, id))
        .for("update")
    )[0];

    if (!current) {
      return { ok: false, reason: "not_found" as const };
    }

    if (!["pending", "rejected"].includes(current.approvalState)) {
      return { ok: false, reason: "blocked" as const };
    }

    if (current.approvalState === "rejected") {
      return { ok: true, feedbackId: await findRejectionFeedbackId(tx, id) };
    }

    await tx
      .update(knowledgeBits)
      .set({ approvalState: "rejected", topicId: null })
      .where(eq(knowledgeBits.id, id));

    return { ok: true, feedbackId: await recordKnowledgeBitDecision(tx, { bitId: id, verdict: "rejected" }) };
  });
}

export type EditKnowledgeBitQuestionVariantResult =
  | { ok: true; variantId: string; knowledgeBitId: string }
  | { error: "not_found" | "blocked" };

// Mirrors updateKnowledgeBitBody's supersede step: detach the old row, insert a fresh one in the
// same (bit, kind, order) slot — never rewrite, so attempt history stays honest.
export async function editKnowledgeBitQuestionVariant(
  variantId: string,
  prompt: string,
  answer: string,
  db: DbExecutor = getDb(),
): Promise<EditKnowledgeBitQuestionVariantResult> {
  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select({
          knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
          kind: knowledgeBitQuestionVariants.kind,
          order: knowledgeBitQuestionVariants.order,
        })
        .from(knowledgeBitQuestionVariants)
        .where(
          and(
            eq(knowledgeBitQuestionVariants.id, variantId),
            isNull(knowledgeBitQuestionVariants.supersededAt),
          ),
        )
        .limit(1)
    )[0];

    if (!existing) {
      return { error: "not_found" as const };
    }

    // Lock the parent bit, not just the variant row, so a concurrent approve can't land mid-edit.
    const bit = (
      await tx
        .select({ approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, existing.knowledgeBitId))
        .for("update")
    )[0];

    if (!bit) {
      return { error: "not_found" as const };
    }

    if (bit.approvalState === "rejected" || bit.approvalState === "superseded") {
      return { error: "blocked" as const };
    }

    // Re-check "still active" here, after the bit lock — a concurrent body-edit regeneration
    // could have superseded this same variant while this transaction waited for that lock.
    const superseded = await tx
      .update(knowledgeBitQuestionVariants)
      .set({ supersededAt: new Date() })
      .where(
        and(
          eq(knowledgeBitQuestionVariants.id, variantId),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      )
      .returning({ id: knowledgeBitQuestionVariants.id });

    if (superseded.length === 0) {
      return { error: "not_found" as const };
    }

    const newVariantId = newId("kbqv");

    await tx.insert(knowledgeBitQuestionVariants).values({
      id: newVariantId,
      knowledgeBitId: existing.knowledgeBitId,
      kind: existing.kind,
      order: existing.order,
      prompt,
      answer,
    });

    return {
      ok: true as const,
      variantId: newVariantId,
      knowledgeBitId: existing.knowledgeBitId,
    };
  });
}

export async function listPendingKnowledgeBitsForReview(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSourceForReview[]> {
  const suggestedSubjects = alias(subjects, "suggested_subjects");
  const bitRows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      background: knowledgeBits.background,
      origin: knowledgeBits.origin,
      reviewFlag: knowledgeBits.reviewFlag,
      isAiGenerated: knowledgeBits.isAiGenerated,
      sourceLinks: knowledgeBits.sourceLinks,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      sourceText: knowledgeSources.rawText,
      sourceUrl: knowledgeSources.sourceUrl,
      summary: knowledgeSources.summary,
      processedAt: knowledgeSources.processedAt,
      subjectName: subjects.name,
      subjectId: subjects.id,
      suggestedSubjectId: suggestedSubjects.id,
      suggestedSubjectName: suggestedSubjects.name,
      suggestedSubjectConfidence: knowledgeSources.suggestedSubjectConfidence,
    })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(subjects, eq(subjects.id, knowledgeSources.subjectId))
    .leftJoin(suggestedSubjects, and(isNull(knowledgeSources.subjectId), eq(suggestedSubjects.id, knowledgeSources.suggestedSubjectId)))
    .where(eq(knowledgeBits.approvalState, "pending"))
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);

  if (bitRows.length === 0) {
    return [];
  }

  const bitIds = bitRows.map((row) => row.id);

  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .orderBy(asc(knowledgeBitQuestionVariants.order));

  const variantsByBitId = new Map<string, typeof variantRows>();

  for (const variant of variantRows) {
    const existing = variantsByBitId.get(variant.knowledgeBitId) ?? [];
    existing.push(variant);
    variantsByBitId.set(variant.knowledgeBitId, existing);
  }

  const sourcesById = new Map<string, PendingKnowledgeSourceForReview>();

  for (const row of bitRows) {
    const source = sourcesById.get(row.knowledgeSourceId) ?? {
      knowledgeSourceId: row.knowledgeSourceId,
      sourceText: row.sourceText,
      sourceUrl: row.sourceUrl,
      summary: row.summary,
      subjectName: row.subjectName ?? null,
      subjectId: row.subjectId ?? null,
      suggestedSubjectId: row.suggestedSubjectId ?? null,
      suggestedSubjectName: row.suggestedSubjectName ?? null,
      suggestedSubjectConfidence: subjectCheckConfidenceSchema.safeParse(row.suggestedSubjectConfidence).data ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      bits: [],
    };

    if (row.processedAt) {
      sourcesById.set(row.knowledgeSourceId, source);
      continue;
    }

    source.bits.push({
      id: row.id,
      body: row.body,
      background: row.background,
      origin: row.origin ?? "extracted",
      reviewFlag: row.reviewFlag,
      isAiGenerated: row.isAiGenerated,
      sourceLinks: row.sourceLinks ?? [],
      variants: (variantsByBitId.get(row.id) ?? []).map((variant) => ({
        id: variant.id,
        kind: variant.kind as KnowledgeBitQuestionVariantKind,
        prompt: variant.prompt,
        answer: variant.answer,
      })),
    });

    sourcesById.set(row.knowledgeSourceId, source);
  }

  return [...sourcesById.values()];
}
