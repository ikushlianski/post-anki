import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { CardBrowserRow, CardSetStatus, TopicCardSet } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { topicCardSets, topicCards, topicCardVariants, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface CurriculumCardsSummary {
  cardsReady: number;
  topicsGenerating: number;
}

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

// A curriculum-wide count, not a per-topic one — lets the course-level view
// show "X cards ready so far" while the rest of the course's cards are
// still being generated in the background, without opening each topic.
export async function getCurriculumCardsSummary(
  curriculumId: string,
): Promise<CurriculumCardsSummary> {
  const db = getDb();

  const [cardsRow] = await db
    .select({ count: sql<number>`count(${topicCards.id})::int` })
    .from(topicCards)
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(and(eq(topics.curriculumId, curriculumId), eq(topicCardSets.status, "ready")));

  const [generatingRow] = await db
    .select({ count: sql<number>`count(${topicCardSets.id})::int` })
    .from(topicCardSets)
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(and(eq(topics.curriculumId, curriculumId), eq(topicCardSets.status, "generating")));

  return {
    cardsReady: cardsRow?.count ?? 0,
    topicsGenerating: generatingRow?.count ?? 0,
  };
}

// The cards browser's own read — every ready variant across the whole
// curriculum, flattened to one row each, in a single joined query.
export async function listCardsForCurriculum(curriculumId: string): Promise<CardBrowserRow[]> {
  const rows = await getDb()
    .select({
      variantId: topicCardVariants.id,
      variantOrder: topicCardVariants.order,
      cardId: topicCards.id,
      cardOrder: topicCards.order,
      concept: topicCards.concept,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      topicId: topics.id,
      topicOrder: topics.order,
      topicTitle: topics.title,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(and(eq(topics.curriculumId, curriculumId), eq(topicCardSets.status, "ready")))
    .orderBy(asc(topics.order), asc(topicCards.order), asc(topicCardVariants.order));

  return rows.map((row) => ({
    variantId: row.variantId,
    cardId: row.cardId,
    concept: row.concept,
    prompt: row.prompt,
    answer: row.answer,
    topicId: row.topicId,
    topicTitle: row.topicTitle,
  }));
}

export interface CardVariantForEmbeddingScan {
  id: string;
  prompt: string;
  answer: string;
  embeddingHash: string | null;
}

export async function listCardVariantsForEmbeddingScan(): Promise<CardVariantForEmbeddingScan[]> {
  return getDb()
    .select({
      id: topicCardVariants.id,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      embeddingHash: topicCardVariants.embeddingHash,
    })
    .from(topicCardVariants);
}

export async function updateCardVariantEmbedding(
  variantId: string,
  embedding: number[],
  hash: string,
): Promise<void> {
  await getDb()
    .update(topicCardVariants)
    .set({ embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(topicCardVariants.id, variantId));
}

export async function listCardVariantsForTopic(
  topicId: string,
): Promise<CardVariantForEmbeddingScan[]> {
  return getDb()
    .select({
      id: topicCardVariants.id,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      embeddingHash: topicCardVariants.embeddingHash,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .where(eq(topicCardSets.topicId, topicId));
}

export interface EmbeddedCardVariant {
  id: string;
  prompt: string;
  answer: string;
  embedding: number[];
  topicId: string;
  topicTitle: string;
}

export async function listEmbeddedCardVariants(): Promise<EmbeddedCardVariant[]> {
  const rows = await getDb()
    .select({
      id: topicCardVariants.id,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      embedding: topicCardVariants.embedding,
      topicId: topics.id,
      topicTitle: topics.title,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(isNotNull(topicCardVariants.embedding));

  return rows.map((row) => ({ ...row, embedding: row.embedding! }));
}

export async function hasCardsGeneratedOrInProgress(topicId: string): Promise<boolean> {
  const row = (
    await getDb()
      .select({ status: topicCardSets.status })
      .from(topicCardSets)
      .where(eq(topicCardSets.topicId, topicId))
  )[0];

  return row !== undefined && (row.status === "ready" || row.status === "generating");
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
