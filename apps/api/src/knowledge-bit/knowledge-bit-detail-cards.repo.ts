import { and, asc, eq, isNull } from "drizzle-orm";
import { cardKeyFor, type KnowledgeBitDetailCard, type KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBitSchedules } from "../db/schema.js";
import { deriveOverviewState } from "./knowledge-bit-overview-state.js";

export async function readKnowledgeBitDetailCards(
  knowledgeBitId: string,
  now: Date,
  db: DbExecutor,
): Promise<KnowledgeBitDetailCard[]> {
  const [variants, schedules] = await Promise.all([
    db
      .select({
        id: knowledgeBitQuestionVariants.id,
        kind: knowledgeBitQuestionVariants.kind,
        order: knowledgeBitQuestionVariants.order,
      })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBitId),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      )
      .orderBy(asc(knowledgeBitQuestionVariants.kind), asc(knowledgeBitQuestionVariants.order)),
    db.select().from(knowledgeBitSchedules).where(eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId)),
  ]);
  const byKey = new Map(schedules.map((schedule) => [schedule.cardKey, schedule]));

  return variants.flatMap((variant) => {
    const cardKey = cardKeyFor(variant);

    if (cardKey === "") {
      return [];
    }

    const schedule = byKey.get(cardKey) ?? null;
    const state = deriveOverviewState(schedule, now);
    const hasDue = schedule !== null && schedule.reviewCount > 0 && state !== "suspended";

    return [
      {
        variantId: variant.id,
        cardKey,
        kind: variant.kind as KnowledgeBitQuestionVariantKind,
        order: variant.order,
        state,
        dueAt: hasDue ? schedule.dueAt.toISOString() : null,
        lapses: schedule?.lapses ?? 0,
        suspended: schedule?.suspendedAt != null,
        buried: state === "buried",
      },
    ];
  });
}
