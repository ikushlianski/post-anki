import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { cardKeyFor, type SuspendedCard, type SuspendedCardsPage, type SuspendedCardsQuery } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { getSubjectNamesByIds } from "../subject/subject.repo.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { scheduleIsActiveCard } from "./knowledge-bit-card-unit.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { ANKI_VARIANT_KIND_PREFERENCE } from "./knowledge-bit-variant-kind-rules.js";

interface OutOfRotationRow {
  knowledgeBitId: string;
  cardKey: string;
  itemText: string;
  suspendedAt: Date | null;
  buriedUntil: Date | null;
  lapses: number;
  subjectId: string | null;
}

interface PreferredVariant {
  knowledgeBitId: string;
  cardKey: string;
  context: string | null;
  prompt: string;
  answer: string;
  kind: string;
  createdAt: Date;
  id: string;
}

const cardUnitKey = (knowledgeBitId: string, cardKey: string) => `${knowledgeBitId}\u0000${cardKey}`;

const kindRank = (kind: string): number => {
  const index = (ANKI_VARIANT_KIND_PREFERENCE as readonly string[]).indexOf(kind);

  return index === -1 ? ANKI_VARIANT_KIND_PREFERENCE.length : index;
};

// Same preference as the review queue: basic over fill-in-the-blank over the rest.
function pickPreferredVariants(variants: PreferredVariant[]): Map<string, PreferredVariant> {
  const picked = new Map<string, PreferredVariant>();

  for (const variant of variants) {
    const key = cardUnitKey(variant.knowledgeBitId, variant.cardKey);
    const current = picked.get(key);

    if (!current || isPreferred(variant, current)) {
      picked.set(key, variant);
    }
  }

  return picked;
}

function isPreferred(candidate: PreferredVariant, current: PreferredVariant): boolean {
  const rankDiff = kindRank(candidate.kind) - kindRank(current.kind);

  if (rankDiff !== 0) {
    return rankDiff < 0;
  }

  const createdDiff = candidate.createdAt.getTime() - current.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff < 0;
  }

  return candidate.id < current.id;
}

function toSuspendedCard(
  row: OutOfRotationRow,
  variant: PreferredVariant,
  subjectName: string | null,
): SuspendedCard {
  const suspended = row.suspendedAt !== null;
  const reason = !suspended ? "buried" : isLeech(row.lapses) ? "leech" : "suspended";

  return {
    knowledgeBitId: row.knowledgeBitId,
    variantId: variant.id,
    cardKey: row.cardKey,
    itemText: row.itemText,
    context: variant.context,
    question: variant.prompt,
    answer: variant.answer,
    subjectName,
    reason,
    lapses: row.lapses,
    suspended,
    buriedUntil: row.buriedUntil?.toISOString() ?? null,
    since: row.suspendedAt?.toISOString() ?? null,
  };
}

// Suspended or buried bits, newest suspension first. Bits with no live question are left out,
// since there is nothing to bring back into review.
export async function listSuspendedKnowledgeBits(
  { limit, offset }: SuspendedCardsQuery,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<SuspendedCardsPage> {
  const rows: OutOfRotationRow[] = await db
    .select({
      knowledgeBitId: knowledgeBits.id,
      cardKey: knowledgeBitSchedules.cardKey,
      itemText: knowledgeBits.body,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
      lapses: knowledgeBitSchedules.lapses,
      subjectId: sql<string | null>`coalesce(${curricula.subjectId}, ${knowledgeSources.subjectId})`,
    })
    .from(knowledgeBitSchedules)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitSchedules.knowledgeBitId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(
      and(
        or(
          isNotNull(knowledgeBitSchedules.suspendedAt),
          and(
            isNotNull(knowledgeBitSchedules.buriedUntil),
            gt(knowledgeBitSchedules.buriedUntil, now),
          ),
        ),
        bitApproved,
        scheduleIsActiveCard(db),
      ),
    )
    .orderBy(
      sql`${knowledgeBitSchedules.suspendedAt} desc nulls last`,
      sql`${knowledgeBitSchedules.buriedUntil} desc nulls last`,
      asc(knowledgeBits.id),
      asc(knowledgeBitSchedules.cardKey),
    )
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  if (pageRows.length === 0) {
    return { items: [], hasMore };
  }

  const bitIds = pageRows.map((row) => row.knowledgeBitId);
  const subjectIds = [...new Set(pageRows.flatMap((row) => (row.subjectId ? [row.subjectId] : [])))];

  const [variantRows, subjectNames] = await Promise.all([
    db
      .select({
        id: knowledgeBitQuestionVariants.id,
        knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
        kind: knowledgeBitQuestionVariants.kind,
        order: knowledgeBitQuestionVariants.order,
        context: knowledgeBitQuestionVariants.context,
        prompt: knowledgeBitQuestionVariants.prompt,
        answer: knowledgeBitQuestionVariants.answer,
        createdAt: knowledgeBitQuestionVariants.createdAt,
      })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      ),
    subjectIds.length > 0 ? getSubjectNamesByIds(subjectIds) : new Map<string, string>(),
  ]);

  const variants = pickPreferredVariants(
    variantRows.map(({ order, ...variant }) => ({ ...variant, cardKey: cardKeyFor({ kind: variant.kind, order }) })),
  );

  const items = pageRows.flatMap((row) => {
    const variant = variants.get(cardUnitKey(row.knowledgeBitId, row.cardKey));

    if (!variant) {
      return [];
    }

    const subjectName = row.subjectId ? (subjectNames.get(row.subjectId) ?? null) : null;
    const buriedUntil = row.buriedUntil && row.buriedUntil > now ? row.buriedUntil : null;

    return [toSuspendedCard({ ...row, buriedUntil }, variant, subjectName)];
  });

  return { items, hasMore };
}
