import { asc, eq, inArray } from "drizzle-orm";
import type { CardSetStatus, TopicCardSet } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { topicCardSets, topicCards, topicCardVariants } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface CardsPlanContent {
  cards: {
    concept: string;
    variants: { prompt: string; answer: string }[];
  }[];
}

async function rowToCardSet(row: typeof topicCardSets.$inferSelect): Promise<TopicCardSet> {
  const db = getDb();

  const cardRows = await db
    .select()
    .from(topicCards)
    .where(eq(topicCards.cardSetId, row.id))
    .orderBy(asc(topicCards.order));

  const variantRows =
    cardRows.length === 0
      ? []
      : await db
          .select()
          .from(topicCardVariants)
          .where(inArray(topicCardVariants.cardId, cardRows.map((c) => c.id)))
          .orderBy(asc(topicCardVariants.order));

  const variantsByCardId = new Map<string, typeof topicCardVariants.$inferSelect[]>();
  for (const variant of variantRows) {
    const existing = variantsByCardId.get(variant.cardId) ?? [];
    existing.push(variant);
    variantsByCardId.set(variant.cardId, existing);
  }

  return {
    id: row.id,
    topicId: row.topicId,
    status: row.status as CardSetStatus,
    createdAt: row.createdAt.toISOString(),
    cards: cardRows.map((card) => ({
      id: card.id,
      cardSetId: card.cardSetId,
      order: card.order,
      concept: card.concept,
      variants: (variantsByCardId.get(card.id) ?? []).map((v) => ({
        id: v.id,
        cardId: v.cardId,
        order: v.order,
        prompt: v.prompt,
        answer: v.answer,
      })),
    })),
  };
}

export async function getCardsByTopic(topicId: string): Promise<TopicCardSet | null> {
  const row = (
    await getDb().select().from(topicCardSets).where(eq(topicCardSets.topicId, topicId))
  )[0];

  if (!row) {
    return null;
  }

  return rowToCardSet(row);
}

export async function startGeneratingCards(topicId: string): Promise<TopicCardSet> {
  const db = getDb();

  const rows = await db
    .insert(topicCardSets)
    .values({ id: newId("cardset"), topicId, status: "generating" })
    .onConflictDoUpdate({
      target: topicCardSets.topicId,
      set: { status: "generating" },
    })
    .returning();

  return rowToCardSet(rows[0]!);
}

export async function replaceCardsContent(
  topicId: string,
  plan: CardsPlanContent,
): Promise<void> {
  const db = getDb();

  const existing = (
    await db.select().from(topicCardSets).where(eq(topicCardSets.topicId, topicId))
  )[0];

  if (!existing) {
    throw new Error("card set not found for topic");
  }

  const existingCardRows = await db
    .select({ id: topicCards.id })
    .from(topicCards)
    .where(eq(topicCards.cardSetId, existing.id));

  if (existingCardRows.length > 0) {
    await db.delete(topicCardVariants).where(
      inArray(topicCardVariants.cardId, existingCardRows.map((c) => c.id)),
    );
  }

  await db.delete(topicCards).where(eq(topicCards.cardSetId, existing.id));

  if (plan.cards.length > 0) {
    const cardIds = plan.cards.map(() => newId("card"));

    await db.insert(topicCards).values(
      plan.cards.map((card, index) => ({
        id: cardIds[index]!,
        cardSetId: existing.id,
        order: index + 1,
        concept: card.concept,
      })),
    );

    const variantRows = plan.cards.flatMap((card, cardIndex) =>
      card.variants.map((variant, variantIndex) => ({
        id: newId("cardvariant"),
        cardId: cardIds[cardIndex]!,
        order: variantIndex + 1,
        prompt: variant.prompt,
        answer: variant.answer,
      })),
    );

    if (variantRows.length > 0) {
      await db.insert(topicCardVariants).values(variantRows);
    }
  }

  await db.update(topicCardSets).set({ status: "ready" }).where(eq(topicCardSets.id, existing.id));
}

export async function setCardsStatus(
  topicId: string,
  status: CardSetStatus,
): Promise<void> {
  await getDb().update(topicCardSets).set({ status }).where(eq(topicCardSets.topicId, topicId));
}

export async function deleteCardsForTopic(
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const existing = (
    await db.select().from(topicCardSets).where(eq(topicCardSets.topicId, topicId))
  )[0];

  if (!existing) {
    return;
  }

  const existingCardRows = await db
    .select({ id: topicCards.id })
    .from(topicCards)
    .where(eq(topicCards.cardSetId, existing.id));

  if (existingCardRows.length > 0) {
    await db.delete(topicCardVariants).where(
      inArray(topicCardVariants.cardId, existingCardRows.map((c) => c.id)),
    );
  }

  await db.delete(topicCards).where(eq(topicCards.cardSetId, existing.id));
  await db.delete(topicCardSets).where(eq(topicCardSets.id, existing.id));
}
