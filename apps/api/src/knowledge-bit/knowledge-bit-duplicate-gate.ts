import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits } from "../db/schema.js";
import { variantRowsForCard } from "./knowledge-bit-source-item-variants.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

export interface DuplicateGateResult {
  lessons: (LessonDraft | null)[];
  skippedCards: number;
}

function keysOfCard(card: LessonDraft["cards"][number], order: number): string[] {
  return variantRowsForCard("", card, order).map((row) => row.cardKey);
}

export async function findExistingCardKeys(db: DbExecutor, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ cardKey: knowledgeBitQuestionVariants.cardKey })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.cardKey, keys),
        isNull(knowledgeBitQuestionVariants.supersededAt),
        notInArray(knowledgeBits.approvalState, ["rejected", "superseded"]),
      ),
    );

  return new Set(rows.flatMap((row) => (row.cardKey === null ? [] : [row.cardKey])));
}

export async function dropDuplicateCards(
  db: DbExecutor,
  lessons: readonly LessonDraft[],
): Promise<DuplicateGateResult> {
  const keysByCard = lessons.map((lesson) => lesson.cards.map((card, order) => keysOfCard(card, order)));
  const known = await findExistingCardKeys(db, [...new Set(keysByCard.flat(2))]);
  const batch = new Set<string>();
  let skippedCards = 0;

  const gated = lessons.map((lesson, lessonIndex) => {
    const kept = lesson.cards.filter((_card, cardIndex) => {
      const keys = keysByCard[lessonIndex]?.[cardIndex] ?? [];
      const duplicate = keys.length > 0 && keys.every((key) => known.has(key) || batch.has(key));

      if (duplicate) {
        skippedCards += 1;

        return false;
      }

      keys.forEach((key) => batch.add(key));

      return true;
    });

    return kept.length === 0 ? null : { ...lesson, cards: kept };
  });

  return { lessons: gated, skippedCards };
}
