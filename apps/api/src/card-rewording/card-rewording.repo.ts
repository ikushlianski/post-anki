import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { RewordedDraft, RewordedDraftAngle } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBitRewordedDrafts, knowledgeBits } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface NewRewordedDraft {
  knowledgeBitId: string;
  prompt: string;
  answer: string;
  angle: RewordedDraftAngle;
  modelId: string;
}

export async function insertRewordedDrafts(db: DbExecutor, rows: readonly NewRewordedDraft[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const inserted = await db
    .insert(knowledgeBitRewordedDrafts)
    .values(rows.map((row) => ({ ...row, id: newId("kbrd") })))
    .returning({ id: knowledgeBitRewordedDrafts.id });

  return inserted.length;
}

export async function listPendingRewordedDrafts(db: DbExecutor, limit: number): Promise<RewordedDraft[]> {
  const rows = await db
    .select({
      id: knowledgeBitRewordedDrafts.id,
      knowledgeBitId: knowledgeBitRewordedDrafts.knowledgeBitId,
      originalPrompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitRewordedDrafts.answer,
      prompt: knowledgeBitRewordedDrafts.prompt,
      angle: knowledgeBitRewordedDrafts.angle,
      createdAt: knowledgeBitRewordedDrafts.createdAt,
    })
    .from(knowledgeBitRewordedDrafts)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitRewordedDrafts.knowledgeBitId))
    .innerJoin(
      knowledgeBitQuestionVariants,
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBitRewordedDrafts.knowledgeBitId),
        eq(knowledgeBitQuestionVariants.kind, "basic"),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .where(and(isNull(knowledgeBitRewordedDrafts.decision), eq(knowledgeBits.approvalState, "approved")))
    .orderBy(asc(knowledgeBitRewordedDrafts.createdAt), asc(knowledgeBitRewordedDrafts.id))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    angle: row.angle as RewordedDraftAngle,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function bitIdsWithAnyDraft(db: DbExecutor, bitIds: readonly string[]): Promise<Set<string>> {
  if (bitIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .selectDistinct({ knowledgeBitId: knowledgeBitRewordedDrafts.knowledgeBitId })
    .from(knowledgeBitRewordedDrafts)
    .where(inArray(knowledgeBitRewordedDrafts.knowledgeBitId, [...bitIds]));

  return new Set(rows.map((row) => row.knowledgeBitId));
}
