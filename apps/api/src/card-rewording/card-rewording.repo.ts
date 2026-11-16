import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RewordedDraft, RewordedDraftAngle } from "@post-anki/shared";
import type { Db, DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBitRewordedDrafts, knowledgeBits } from "../db/schema.js";
import { cardTextKey } from "../knowledge-bit/knowledge-bit-card-text-key.js";
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

export async function recordRewordingFailure(db: DbExecutor, knowledgeBitId: string, modelId: string): Promise<void> {
  await db.insert(knowledgeBitRewordedDrafts).values({
    id: newId("kbrd"),
    knowledgeBitId,
    prompt: "",
    answer: "",
    angle: "cause",
    modelId,
    decision: "failed",
    decidedAt: new Date(),
  });
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

export type DecideRewordedDraftResult =
  | { status: "ok"; variantId: string | null }
  | { status: "not_found" }
  | { status: "conflict" };

export async function decideRewordedDraft(
  db: Db,
  id: string,
  decision: "approved" | "rejected",
): Promise<DecideRewordedDraftResult> {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(knowledgeBitRewordedDrafts)
      .where(eq(knowledgeBitRewordedDrafts.id, id))
      .for("update");

    if (!draft) {
      return { status: "not_found" };
    }

    const [bit] = await tx
      .select({ approvalState: knowledgeBits.approvalState })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, draft.knowledgeBitId))
      .for("update");

    if (draft.decision !== null || bit?.approvalState !== "approved") {
      return { status: "conflict" };
    }

    let variantId: string | null = null;

    if (decision === "approved") {
      variantId = newId("kbqv");

      const [{ nextOrder = 0 } = {}] = await tx
        .select({ nextOrder: sql<number>`coalesce(max(${knowledgeBitQuestionVariants.order}), -1) + 1` })
        .from(knowledgeBitQuestionVariants)
        .where(
          and(
            eq(knowledgeBitQuestionVariants.knowledgeBitId, draft.knowledgeBitId),
            eq(knowledgeBitQuestionVariants.kind, "reworded"),
            isNull(knowledgeBitQuestionVariants.supersededAt),
          ),
        );

      await tx.insert(knowledgeBitQuestionVariants).values({
        id: variantId,
        knowledgeBitId: draft.knowledgeBitId,
        kind: "reworded",
        order: Number(nextOrder),
        prompt: draft.prompt,
        answer: draft.answer,
        cardKey: cardTextKey(draft.prompt, draft.answer),
      });
    }

    await tx
      .update(knowledgeBitRewordedDrafts)
      .set({ decision, decidedAt: new Date(), variantId })
      .where(eq(knowledgeBitRewordedDrafts.id, id));

    return { status: "ok", variantId };
  });
}
