import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { CardSetStatus, TopicCardSet } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  topicCardSets,
  topicCards,
  topicCardVariants,
  topics,
  curricula,
  subjects,
  tags,
  tagAssignments,
  curriculumDomainNodeMappings,
  domainNodes,
} from "../db/schema.js";
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

async function rowToCardSet(
  row: typeof topicCardSets.$inferSelect,
  db: DbExecutor = getDb(),
): Promise<TopicCardSet> {
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

export async function getCardsByTopic(
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<TopicCardSet | null> {
  const row = (
    await db.select().from(topicCardSets).where(eq(topicCardSets.topicId, topicId))
  )[0];

  if (!row) {
    return null;
  }

  return rowToCardSet(row, db);
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
  subjectId: string;
  subjectName: string;
  tags: string[];
  domainNodeNames: string[];
}

// Batched per-table lookups (not a single join), matching tag.repo.ts/
// domain-map.repo.ts's own pattern for a topic/curriculum with zero matches.
async function labelsForCardVariants(
  rows: { topicId: string; curriculumId: string }[],
): Promise<{
  subjectIdByCurriculumId: Map<string, string>;
  subjectNameById: Map<string, string>;
  tagNamesByTopicId: Map<string, string[]>;
  domainNodeNamesByCurriculumId: Map<string, string[]>;
}> {
  const db = getDb();
  const curriculumIds = [...new Set(rows.map((r) => r.curriculumId))];
  const topicIds = [...new Set(rows.map((r) => r.topicId))];

  const curriculumRows = curriculumIds.length
    ? await db
        .select({ id: curricula.id, subjectId: curricula.subjectId })
        .from(curricula)
        .where(inArray(curricula.id, curriculumIds))
    : [];
  const subjectIdByCurriculumId = new Map(curriculumRows.map((r) => [r.id, r.subjectId]));
  const subjectIds = [...new Set(curriculumRows.map((r) => r.subjectId))];

  const subjectRows = subjectIds.length
    ? await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(
        inArray(subjects.id, subjectIds),
      )
    : [];
  const subjectNameById = new Map(subjectRows.map((r) => [r.id, r.name]));

  const assignmentRows = topicIds.length
    ? await db
        .select({ tagId: tagAssignments.tagId, nodeId: tagAssignments.nodeId })
        .from(tagAssignments)
        .where(and(eq(tagAssignments.nodeType, "topic"), inArray(tagAssignments.nodeId, topicIds)))
    : [];
  const tagIds = [...new Set(assignmentRows.map((r) => r.tagId))];

  const tagRows = tagIds.length
    ? await db.select({ id: tags.id, name: tags.name }).from(tags).where(inArray(tags.id, tagIds))
    : [];
  const tagNameById = new Map(tagRows.map((r) => [r.id, r.name]));

  const tagNamesByTopicId = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const name = tagNameById.get(assignment.tagId);
    if (!name) {
      continue;
    }
    const existing = tagNamesByTopicId.get(assignment.nodeId) ?? [];
    existing.push(name);
    tagNamesByTopicId.set(assignment.nodeId, existing);
  }
  for (const names of tagNamesByTopicId.values()) {
    names.sort();
  }

  const confirmedMappingRows = curriculumIds.length
    ? await db
        .select({
          curriculumId: curriculumDomainNodeMappings.curriculumId,
          domainNodeId: curriculumDomainNodeMappings.domainNodeId,
        })
        .from(curriculumDomainNodeMappings)
        .where(
          and(
            inArray(curriculumDomainNodeMappings.curriculumId, curriculumIds),
            eq(curriculumDomainNodeMappings.status, "confirmed"),
          ),
        )
    : [];
  const domainNodeIds = [...new Set(confirmedMappingRows.map((r) => r.domainNodeId))];

  const domainNodeRows = domainNodeIds.length
    ? await db
        .select({ id: domainNodes.id, name: domainNodes.name })
        .from(domainNodes)
        .where(inArray(domainNodes.id, domainNodeIds))
    : [];
  const domainNodeNameById = new Map(domainNodeRows.map((r) => [r.id, r.name]));

  // A curriculum can have multiple confirmed domain nodes (see domain-map.repo.ts) — surface all,
  // sorted, for a stable order.
  const domainNodeNamesByCurriculumId = new Map<string, string[]>();
  for (const mapping of confirmedMappingRows) {
    const name = domainNodeNameById.get(mapping.domainNodeId);
    if (!name) {
      continue;
    }
    const existing = domainNodeNamesByCurriculumId.get(mapping.curriculumId) ?? [];
    if (!existing.includes(name)) {
      existing.push(name);
    }
    domainNodeNamesByCurriculumId.set(mapping.curriculumId, existing);
  }
  for (const names of domainNodeNamesByCurriculumId.values()) {
    names.sort();
  }

  return { subjectIdByCurriculumId, subjectNameById, tagNamesByTopicId, domainNodeNamesByCurriculumId };
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
      curriculumId: topics.curriculumId,
    })
    .from(topicCardVariants)
    .innerJoin(topicCards, eq(topicCardVariants.cardId, topicCards.id))
    .innerJoin(topicCardSets, eq(topicCards.cardSetId, topicCardSets.id))
    .innerJoin(topics, eq(topicCardSets.topicId, topics.id))
    .where(isNotNull(topicCardVariants.embedding));

  const { subjectIdByCurriculumId, subjectNameById, tagNamesByTopicId, domainNodeNamesByCurriculumId } =
    await labelsForCardVariants(rows);

  return rows.map((row) => {
    const subjectId = subjectIdByCurriculumId.get(row.curriculumId) ?? "";

    return {
      id: row.id,
      prompt: row.prompt,
      answer: row.answer,
      embedding: row.embedding!,
      topicId: row.topicId,
      topicTitle: row.topicTitle,
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? "",
      tags: tagNamesByTopicId.get(row.topicId) ?? [],
      domainNodeNames: domainNodeNamesByCurriculumId.get(row.curriculumId) ?? [],
    };
  });
}

// Matches the knowledge-bit detector's own stale-processing threshold.
export const GENERATING_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export async function hasCardsGeneratedOrInProgress(
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const row = (
    await db
      .select({ status: topicCardSets.status, updatedAt: topicCardSets.updatedAt })
      .from(topicCardSets)
      .where(eq(topicCardSets.topicId, topicId))
  )[0];

  if (row === undefined) {
    return false;
  }

  if (row.status === "ready") {
    return true;
  }

  if (row.status === "generating") {
    const ageMs = Date.now() - row.updatedAt.getTime();

    // A crashed run never reaches the catch that flips it to "failed".
    return ageMs < GENERATING_STALE_THRESHOLD_MS;
  }

  return false;
}

export async function startGeneratingCards(
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<TopicCardSet> {
  const now = new Date();
  const rows = await db
    .insert(topicCardSets)
    .values({ id: newId("cardset"), topicId, status: "generating", updatedAt: now })
    .onConflictDoUpdate({
      target: topicCardSets.topicId,
      set: { status: "generating", updatedAt: now },
    })
    .returning();

  return rowToCardSet(rows[0]!, db);
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

  await db
    .update(topicCardSets)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(topicCardSets.id, existing.id));
}

export async function setCardsStatus(
  topicId: string,
  status: CardSetStatus,
): Promise<void> {
  await getDb()
    .update(topicCardSets)
    .set({ status, updatedAt: new Date() })
    .where(eq(topicCardSets.topicId, topicId));
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
