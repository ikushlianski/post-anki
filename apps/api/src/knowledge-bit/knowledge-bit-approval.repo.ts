import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import { isOrderedListKind } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants, knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { findRejectionFeedbackId } from "./knowledge-bit-feedback.repo.js";
import { deleteChatQueueMessages } from "./knowledge-bit-chat-queue-messages.repo.js";
import { recordKnowledgeBitDecision } from "./knowledge-bit-feedback-decision.repo.js";
import { supersedeOtherVariantsIn } from "./knowledge-bit-triage.repo.js";
export { listPendingKnowledgeBitsForReview } from "./knowledge-bit-pending-list.repo.js";

// Learner-facing read gate — every surface that lets a learner answer, chat with, search, or
// browse a knowledge bit must apply this, so a bit stays invisible until a human approves it.
export const bitApproved = eq(knowledgeBits.approvalState, "approved");

// Background-work gate — scans skip bits a human rejected or a regeneration superseded.
export const bitNotDiscarded = notInArray(knowledgeBits.approvalState, ["rejected", "superseded"]);

async function isPhraseSourceBit(db: DbExecutor, bitId: string): Promise<boolean> {
  const row = (
    await db
      .select({ kind: knowledgeSources.kind })
      .from(knowledgeBits)
      .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(eq(knowledgeBits.id, bitId))
  )[0];

  return row?.kind === "phrase";
}

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

    if (!["pending", "chat", "approved"].includes(current.approvalState)) {
      return "blocked";
    }

    if (current.approvalState === "pending" || current.approvalState === "chat") {
      const active = await tx
        .select({ id: knowledgeBitQuestionVariants.id })
        .from(knowledgeBitQuestionVariants)
        .where(
          and(
            eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
            isNull(knowledgeBitQuestionVariants.supersededAt),
          ),
        )
        .orderBy(asc(knowledgeBitQuestionVariants.order));
      const first = active[0];

      if (!first) {
        return "no_variant";
      }

      if (active.length > 1 && (await isPhraseSourceBit(tx, id))) {
        await supersedeOtherVariantsIn(tx, id, [first.id]);
      }

      await tx
        .update(knowledgeBits)
        .set({ approvalState: "approved", reviewFlag: null, decidedAt: new Date() })
        .where(eq(knowledgeBits.id, id));
      await deleteChatQueueMessages(tx, [id]);
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

    if (!["pending", "chat", "rejected"].includes(current.approvalState)) {
      return { ok: false, reason: "blocked" as const };
    }

    if (current.approvalState === "rejected") {
      return { ok: true, feedbackId: await findRejectionFeedbackId(tx, id) };
    }

    await tx
      .update(knowledgeBits)
      .set({ approvalState: "rejected", topicId: null, decidedAt: new Date() })
      .where(eq(knowledgeBits.id, id));
    await deleteChatQueueMessages(tx, [id]);

    return { ok: true, feedbackId: await recordKnowledgeBitDecision(tx, { bitId: id, verdict: "rejected" }) };
  });
}

export type EditKnowledgeBitQuestionVariantResult =
  | { ok: true; variantId: string; knowledgeBitId: string }
  | { error: "not_found" | "blocked" | "wrong_shape" };

// Mirrors updateKnowledgeBitBody's supersede step: detach the old row, insert a fresh one in the
// same (bit, kind, order) slot — never rewrite, so attempt history stays honest.
export async function editKnowledgeBitQuestionVariant(
  variantId: string,
  prompt: string,
  answer: string,
  context?: string | null,
  db: DbExecutor = getDb(),
): Promise<EditKnowledgeBitQuestionVariantResult> {
  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select({
          knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
          kind: knowledgeBitQuestionVariants.kind,
          order: knowledgeBitQuestionVariants.order,
          context: knowledgeBitQuestionVariants.context,
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

    if (existing.kind === "cloze" || isOrderedListKind(existing.kind)) {
      return { error: "wrong_shape" as const };
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
      context: context === undefined ? existing.context : context?.trim() || null,
      answer,
    });

    return {
      ok: true as const,
      variantId: newVariantId,
      knowledgeBitId: existing.knowledgeBitId,
    };
  });
}
