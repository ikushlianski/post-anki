import { and, asc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { cardSubjectIdSql } from "./knowledge-bit-card-subject.js";
import {
  DIFFICULT_AGAIN_AFTER_INTERVAL_DAYS,
  DIFFICULT_MIN_AGAINS,
  DIFFICULT_MIN_DAYS_SINCE_FIRST_REVIEW,
  DIFFICULT_MIN_REVIEWS,
  DIFFICULT_STRUGGLE_SHARE,
  RETIRE_MIN_PREV_INTERVAL_DAYS,
  RETIRE_RECENT_REVIEWS,
} from "./knowledge-bit-card-difficulty.config.js";

const PLAIN_CARD_KEY = "";

const prevIntervalDays = (alias: string) =>
  sql.raw(`coalesce((${alias}.prev_schedule->>'intervalDays')::float8, 0)`);

export function cardIsDifficultSql(
  bitIdCol: SQLWrapper,
  cardKeyCol: SQLWrapper,
  now: Date,
): SQL<boolean> {
  const againInterval = sql.raw(String(DIFFICULT_AGAIN_AFTER_INTERVAL_DAYS));
  const retireInterval = sql.raw(String(RETIRE_MIN_PREV_INTERVAL_DAYS));
  const nowTs = sql`${now.toISOString()}::timestamptz`;

  return sql<boolean>`(
    exists (
      select 1 from knowledge_bit_reviews dr
      where dr.knowledge_bit_id = ${bitIdCol} and dr.card_key = ${cardKeyCol} and dr.undone_at is null
      having count(*) >= ${DIFFICULT_MIN_REVIEWS}
        and min(dr.reviewed_at) <= ${nowTs} - make_interval(days => ${DIFFICULT_MIN_DAYS_SINCE_FIRST_REVIEW})
        and (
          count(*) filter (where dr.grade = 'again') >= ${DIFFICULT_MIN_AGAINS}
          or count(*) filter (where dr.grade in ('again', 'hard')) >= count(*) * ${DIFFICULT_STRUGGLE_SHARE}::float8
          or bool_or(dr.grade = 'again' and ${prevIntervalDays("dr")} >= ${againInterval})
        )
    )
    and not (
      select count(*) = ${RETIRE_RECENT_REVIEWS} and bool_and(rr.grade in ('good', 'easy') and ${prevIntervalDays("rr")} >= ${retireInterval})
      from (
        select r.grade, r.prev_schedule from knowledge_bit_reviews r
        where r.knowledge_bit_id = ${bitIdCol} and r.card_key = ${cardKeyCol} and r.undone_at is null
        order by r.reviewed_at desc, r.id desc
        limit ${RETIRE_RECENT_REVIEWS}
      ) rr
    )
  )`;
}

export interface DifficultPlainCard {
  bitId: string;
  front: string;
  back: string;
  subjectId: string | null;
}

export interface ListDifficultPlainCardsOptions {
  subjectIds?: string[];
  limit: number;
  now?: Date;
}

export async function listDifficultPlainCards(
  db: DbExecutor,
  options: ListDifficultPlainCardsOptions,
): Promise<DifficultPlainCard[]> {
  const now = options.now ?? new Date();

  const rows = await db
    .select({
      bitId: knowledgeBits.id,
      front: knowledgeBitQuestionVariants.prompt,
      back: knowledgeBitQuestionVariants.answer,
      subjectId: cardSubjectIdSql,
    })
    .from(knowledgeBits)
    .innerJoin(
      knowledgeBitQuestionVariants,
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
        eq(knowledgeBitQuestionVariants.kind, "basic"),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        bitApproved,
        options.subjectIds ? inArray(cardSubjectIdSql, options.subjectIds) : undefined,
        cardIsDifficultSql(knowledgeBits.id, sql`${PLAIN_CARD_KEY}`, now),
      ),
    )
    .orderBy(asc(knowledgeBits.id))
    .limit(options.limit);

  return rows;
}
