import { and, gte, isNull, lt, sql } from "drizzle-orm";
import { MASTERED_INTERVAL_DAYS } from "@post-anki/core";
import type { LocalDateRange } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitReviews } from "../db/schema.js";
import { getRangeWindow, type TimeWindow } from "../study-goal/study-goal-activity.repo.js";

const OLDER_CARD_INTERVAL_DAYS = 30;
const AVERAGE_SAMPLE = 200;

const iso = (value: Date) => sql`${value.toISOString()}::timestamptz`;

export async function reviewCountsByLocalDay(
  tz: string,
  range: LocalDateRange,
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const window = await getRangeWindow(tz, range, db);
  const localDay = sql<string>`to_char(${knowledgeBitReviews.reviewedAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day: localDay, total: sql<number>`count(*)`.mapWith(Number) })
    .from(knowledgeBitReviews)
    .where(
      and(
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, window.startsAt),
        lt(knowledgeBitReviews.reviewedAt, window.endsAt),
      ),
    )
    .groupBy(sql`1`);

  return new Map(rows.map((row) => [row.day, row.total]));
}

export async function countReviewsOnLocalDay(tz: string, day: string, db: DbExecutor = getDb()): Promise<number> {
  const nextDay = new Date(new Date(day).getTime() + 86_400_000).toISOString().slice(0, 10);
  const counts = await reviewCountsByLocalDay(tz, { start: day, end: nextDay }, db);

  return counts.get(day) ?? 0;
}

export async function countNewlySolid(window: TimeWindow, db: DbExecutor = getDb()): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    select count(distinct e.knowledge_bit_id)::int as total
    from review_point_events e
    join knowledge_bit_reviews r on r.id = e.review_id
    where e.voided_at is null
      and r.undone_at is null
      and r.reviewed_at >= ${iso(window.startsAt)}
      and r.reviewed_at < ${iso(window.endsAt)}
      and e.interval_days_after >= ${MASTERED_INTERVAL_DAYS}
      and coalesce((r.prev_schedule->>'intervalDays')::real, 0) < ${MASTERED_INTERVAL_DAYS}
  `);

  return result.rows[0]?.total ?? 0;
}

export async function countSolidByLocalWeek(
  tz: string,
  window: TimeWindow,
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const result = await db.execute<{ week: string; total: number }>(sql`
    select to_char(date_trunc('week', r.reviewed_at at time zone ${tz}), 'YYYY-MM-DD') as week,
           count(distinct e.knowledge_bit_id)::int as total
    from review_point_events e
    join knowledge_bit_reviews r on r.id = e.review_id
    where e.voided_at is null
      and r.undone_at is null
      and r.reviewed_at >= ${iso(window.startsAt)}
      and r.reviewed_at < ${iso(window.endsAt)}
      and e.interval_days_after >= ${MASTERED_INTERVAL_DAYS}
      and coalesce((r.prev_schedule->>'intervalDays')::real, 0) < ${MASTERED_INTERVAL_DAYS}
    group by 1
  `);

  return new Map(result.rows.map((row) => [row.week, row.total]));
}

export async function readOlderCardRetention(
  window: TimeWindow,
  db: DbExecutor = getDb(),
): Promise<{ total: number; recalled: number }> {
  const result = await db.execute<{ total: number; recalled: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where r.grade <> 'again')::int as recalled
    from knowledge_bit_reviews r
    where r.undone_at is null
      and r.reviewed_at >= ${iso(window.startsAt)}
      and r.reviewed_at < ${iso(window.endsAt)}
      and coalesce((r.prev_schedule->>'intervalDays')::real, 0) >= ${OLDER_CARD_INTERVAL_DAYS}
  `);
  const row = result.rows[0];

  return { total: row?.total ?? 0, recalled: row?.recalled ?? 0 };
}

export async function countDueBefore(until: Date, db: DbExecutor = getDb()): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    select count(*)::int as total
    from knowledge_bit_schedules s
    join knowledge_bits b on b.id = s.knowledge_bit_id
    where b.approval_state = 'approved'
      and s.suspended_at is null
      and s.due_at < ${iso(until)}
      and (
        not exists (select 1 from knowledge_bit_cards kc where kc.knowledge_bit_id = s.knowledge_bit_id)
        or exists (select 1 from knowledge_bit_cards kc where kc.knowledge_bit_id = s.knowledge_bit_id and kc.card_key = s.card_key)
      )
  `);

  return result.rows[0]?.total ?? 0;
}

export async function readAverageReviewMs(db: DbExecutor = getDb()): Promise<number | null> {
  const result = await db.execute<{ average: number | null }>(sql`
    select avg(duration_ms)::float as average
    from (
      select duration_ms from knowledge_bit_reviews
      where undone_at is null and duration_ms is not null
      order by reviewed_at desc
      limit ${AVERAGE_SAMPLE}
    ) recent
  `);

  return result.rows[0]?.average ?? null;
}

export async function findLongGapRecall(
  window: TimeWindow,
  minGapDays: number,
  db: DbExecutor = getDb(),
): Promise<{ knowledgeBitId: string; gapDays: number; subjectName: string | null } | null> {
  const result = await db.execute<{ knowledge_bit_id: string; gap_days: number; subject_name: string | null }>(sql`
    select r.knowledge_bit_id,
           floor(extract(epoch from (r.reviewed_at - (r.prev_schedule->>'lastReviewedAt')::timestamptz)) / 86400)::int as gap_days,
           sub.name as subject_name
    from knowledge_bit_reviews r
    left join knowledge_bits b on b.id = r.knowledge_bit_id
    left join topics t on t.id = b.topic_id
    left join curricula c on c.id = t.curriculum_id
    left join knowledge_sources ks on ks.id = b.knowledge_source_id
    left join subjects sub on sub.id = case when b.topic_id is null then ks.subject_id else c.subject_id end
    where r.undone_at is null
      and r.grade in ('good', 'easy')
      and r.prev_schedule->>'lastReviewedAt' is not null
      and r.reviewed_at >= ${iso(window.startsAt)}
      and r.reviewed_at < ${iso(window.endsAt)}
      and r.reviewed_at - (r.prev_schedule->>'lastReviewedAt')::timestamptz >= make_interval(days => ${minGapDays})
    order by gap_days desc
    limit 1
  `);
  const row = result.rows[0];

  return row ? { knowledgeBitId: row.knowledge_bit_id, gapDays: row.gap_days, subjectName: row.subject_name } : null;
}
