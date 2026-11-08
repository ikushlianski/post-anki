import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  curricula,
  knowledgeBits,
  knowledgeSources,
  subjects,
  topicCards,
  topicCardSets,
  topicCardVariants,
  topics,
} from "../db/schema.js";
import { bitNotDiscarded } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { normalizedColumnIn, normalizeDuplicateText } from "./normalize-duplicate-text.js";

export const DUPLICATE_LOOKUP_ROW_CAP = 1000;

export interface DuplicateSourceRow {
  id: string;
  rawText: string | null;
  summary: string | null;
  importKey: string | null;
  subjectId: string | null;
  subjectName: string | null;
}

export interface DuplicateBitRow {
  id: string;
  body: string;
  knowledgeSourceId: string;
}

export interface DuplicateCardRow {
  cardId: string;
  matchedText: string;
  topicId: string;
}

export async function findSourcesByExactTextOrKey(
  texts: string[],
  keys: string[],
  subjectId: string | undefined,
  normalizedTexts: string[] = [],
): Promise<DuplicateSourceRow[]> {
  const matchers: SQL[] = [];

  if (texts.length > 0 || normalizedTexts.length > 0) {
    const textMatchers: SQL[] = [];

    if (texts.length > 0) {
      textMatchers.push(inArray(knowledgeSources.rawText, texts));
    }

    if (normalizedTexts.length > 0) {
      textMatchers.push(normalizedColumnIn(knowledgeSources.rawText, normalizedTexts));
    }

    matchers.push(and(eq(knowledgeSources.kind, "prose"), or(...textMatchers))!);
  }

  if (keys.length > 0) {
    matchers.push(inArray(knowledgeSources.importKey, keys));
  }

  if (matchers.length === 0) {
    return [];
  }

  return getDb()
    .select({
      id: knowledgeSources.id,
      rawText: knowledgeSources.rawText,
      summary: knowledgeSources.summary,
      importKey: knowledgeSources.importKey,
      subjectId: knowledgeSources.subjectId,
      subjectName: subjects.name,
    })
    .from(knowledgeSources)
    .leftJoin(subjects, eq(subjects.id, knowledgeSources.subjectId))
    .where(
      and(or(...matchers), subjectId === undefined ? undefined : eq(knowledgeSources.subjectId, subjectId)),
    )
    .orderBy(knowledgeSources.createdAt, knowledgeSources.id)
    .limit(DUPLICATE_LOOKUP_ROW_CAP);
}

export async function findBitsByExactBody(
  texts: string[],
  subjectId: string | undefined,
  normalizedTexts: string[] = [],
): Promise<DuplicateBitRow[]> {
  if (texts.length === 0 && normalizedTexts.length === 0) {
    return [];
  }

  return getDb()
    .select({ id: knowledgeBits.id, body: knowledgeBits.body, knowledgeSourceId: knowledgeBits.knowledgeSourceId })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        bitNotDiscarded,
        or(
          texts.length > 0 ? inArray(knowledgeBits.body, texts) : undefined,
          normalizedTexts.length > 0 ? normalizedColumnIn(knowledgeBits.body, normalizedTexts) : undefined,
        ),
        subjectId === undefined ? undefined : eq(knowledgeSources.subjectId, subjectId),
      ),
    )
    .orderBy(knowledgeBits.id)
    .limit(DUPLICATE_LOOKUP_ROW_CAP);
}

export async function findReadyCardsByExactText(
  texts: string[],
  subjectId: string | undefined,
  normalizedTexts: string[] = [],
): Promise<DuplicateCardRow[]> {
  if (texts.length === 0 && normalizedTexts.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select({
      cardId: topicCards.id,
      concept: topicCards.concept,
      prompt: topicCardVariants.prompt,
      answer: topicCardVariants.answer,
      topicId: topicCardSets.topicId,
    })
    .from(topicCards)
    .innerJoin(topicCardSets, eq(topicCardSets.id, topicCards.cardSetId))
    .innerJoin(topics, eq(topics.id, topicCardSets.topicId))
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(topicCardVariants, eq(topicCardVariants.cardId, topicCards.id))
    .where(
      and(
        eq(topicCardSets.status, "ready"),
        or(
          texts.length > 0 ? inArray(topicCards.concept, texts) : undefined,
          texts.length > 0 ? inArray(topicCardVariants.prompt, texts) : undefined,
          texts.length > 0 ? inArray(topicCardVariants.answer, texts) : undefined,
          normalizedTexts.length > 0 ? normalizedColumnIn(topicCards.concept, normalizedTexts) : undefined,
          normalizedTexts.length > 0 ? normalizedColumnIn(topicCardVariants.prompt, normalizedTexts) : undefined,
          normalizedTexts.length > 0 ? normalizedColumnIn(topicCardVariants.answer, normalizedTexts) : undefined,
        ),
        subjectId === undefined ? undefined : eq(curricula.subjectId, subjectId),
      ),
    )
    .orderBy(topicCards.id)
    .limit(DUPLICATE_LOOKUP_ROW_CAP);

  const wanted = new Set(texts);
  const wantedNormalized = new Set(normalizedTexts);

  return rows.flatMap((row) => {
    const candidates = [row.concept, row.prompt, row.answer];
    const matchedText =
      candidates.find((v) => v !== null && wanted.has(v)) ??
      candidates.find((v) => v !== null && wantedNormalized.has(normalizeDuplicateText(v)));

    return matchedText === undefined || matchedText === null
      ? []
      : [{ cardId: row.cardId, matchedText, topicId: row.topicId }];
  });
}
