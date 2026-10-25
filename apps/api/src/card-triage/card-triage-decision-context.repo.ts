import { and, asc, desc, eq } from "drizzle-orm";
import type { TriageDecisionVariant } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import {
  knowledgeBitFeedback,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
} from "../db/schema.js";
import { FEEDBACK_SNAPSHOT_MAX_CHARS } from "../knowledge-bit/knowledge-bit-feedback.types.js";

export interface DecisionContext {
  approvalState: string;
  knowledgeSourceId: string;
  subjectId: string | null;
  extractionModelId: string | null;
  extractionRun: number | null;
  reviewFlag: string | null;
  variants: TriageDecisionVariant[];
  front: string | null;
  back: string | null;
}

function clip(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.slice(0, FEEDBACK_SNAPSHOT_MAX_CHARS);
}

export async function loadDecisionContext(db: DbExecutor, bitId: string): Promise<DecisionContext | null> {
  const [bit] = await db
    .select({
      body: knowledgeBits.body,
      approvalState: knowledgeBits.approvalState,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      reviewFlag: knowledgeBits.reviewFlag,
    })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, bitId))
    .limit(1);

  if (!bit) {
    return null;
  }

  const [[source], variants] = await Promise.all([
    db
      .select({
        subjectId: knowledgeSources.subjectId,
        extractionModelId: knowledgeSources.extractionModelId,
        extractionRun: knowledgeSources.extractionRun,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, bit.knowledgeSourceId))
      .limit(1),
    db
      .select({
        id: knowledgeBitQuestionVariants.id,
        kind: knowledgeBitQuestionVariants.kind,
        prompt: knowledgeBitQuestionVariants.prompt,
        answer: knowledgeBitQuestionVariants.answer,
        supersededAt: knowledgeBitQuestionVariants.supersededAt,
      })
      .from(knowledgeBitQuestionVariants)
      .where(eq(knowledgeBitQuestionVariants.knowledgeBitId, bitId))
      .orderBy(asc(knowledgeBitQuestionVariants.order), asc(knowledgeBitQuestionVariants.createdAt)),
  ]);

  const primary = variants.find((variant) => variant.supersededAt === null);

  return {
    approvalState: bit.approvalState,
    knowledgeSourceId: bit.knowledgeSourceId,
    subjectId: source?.subjectId ?? null,
    extractionModelId: source?.extractionModelId ?? null,
    extractionRun: source?.extractionRun ?? null,
    reviewFlag: bit.reviewFlag,
    variants: variants.map((variant) => ({ id: variant.id, kind: variant.kind, kept: variant.supersededAt === null })),
    front: clip(primary?.prompt ?? bit.body),
    back: clip(primary?.answer),
  };
}

export interface LatestFeedbackRef {
  id: string;
  modelId: string | null;
}

export async function findLatestFeedbackRef(
  db: DbExecutor,
  bitId: string,
  verdict: "approved" | "rejected",
): Promise<LatestFeedbackRef | null> {
  const [row] = await db
    .select({ id: knowledgeBitFeedback.id, modelId: knowledgeBitFeedback.modelId })
    .from(knowledgeBitFeedback)
    .where(and(eq(knowledgeBitFeedback.knowledgeBitId, bitId), eq(knowledgeBitFeedback.verdict, verdict)))
    .orderBy(desc(knowledgeBitFeedback.createdAt))
    .limit(1);

  return row ?? null;
}
