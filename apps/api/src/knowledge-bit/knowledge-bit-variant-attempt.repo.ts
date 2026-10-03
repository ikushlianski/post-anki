import { eq } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind, Verdict } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBits,
  knowledgeBitQuestionVariants,
  knowledgeBitVariantAttempts,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface QuestionVariantForGrading {
  id: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
  approvalState: "pending" | "approved" | "rejected";
}

export async function getQuestionVariantById(
  id: string,
  db: DbExecutor = getDb(),
): Promise<QuestionVariantForGrading | null> {
  const rows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      approvalState: knowledgeBits.approvalState,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .where(eq(knowledgeBitQuestionVariants.id, id))
    .limit(1);

  const row = rows[0];

  return row
    ? {
        ...row,
        kind: row.kind as KnowledgeBitQuestionVariantKind,
        approvalState: row.approvalState as QuestionVariantForGrading["approvalState"],
      }
    : null;
}

export interface VariantAttemptInsertRow {
  variantId: string;
  userAnswer: string;
  score: number;
  verdict: Verdict;
  feedback: string;
}

export type InsertVariantAttemptResult = { ok: true } | { error: "not_approved" };

// Always a fresh insert, never an update — one row per attempt. Rejects an unapproved bit's
// variant even on a direct call, as a backstop behind the orchestrator's own earlier check.
export async function insertVariantAttempt(
  row: VariantAttemptInsertRow,
  db: DbExecutor = getDb(),
): Promise<InsertVariantAttemptResult> {
  const rows = await db
    .select({ approvalState: knowledgeBits.approvalState })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .where(eq(knowledgeBitQuestionVariants.id, row.variantId))
    .limit(1);

  if (rows[0]?.approvalState !== "approved") {
    return { error: "not_approved" };
  }

  await db.insert(knowledgeBitVariantAttempts).values({
    id: newId("kbvattempt"),
    variantId: row.variantId,
    userAnswer: row.userAnswer,
    score: row.score,
    verdict: row.verdict,
    feedback: row.feedback,
  });

  return { ok: true };
}
