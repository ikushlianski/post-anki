import { sql } from "drizzle-orm";
import { MASTERED_INTERVAL_DAYS } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import type { TimeWindow } from "../study-goal/study-goal-activity.repo.js";

export interface SubjectCardTotals {
  subjectId: string;
  subjectName: string;
  totalCards: number;
  masteredCards: number;
}

const iso = (value: Date) => sql`${value.toISOString()}::timestamptz`;

export async function readSubjectCardTotals(db: DbExecutor = getDb()): Promise<SubjectCardTotals[]> {
  const result = await db.execute<{ subject_id: string; subject_name: string; total: number; mastered: number }>(sql`
    select sub.id as subject_id,
           sub.name as subject_name,
           count(*)::int as total,
           count(*) filter (where s.interval_days >= ${MASTERED_INTERVAL_DAYS})::int as mastered
    from knowledge_bits b
    left join topics t on t.id = b.topic_id
    left join curricula c on c.id = t.curriculum_id
    left join knowledge_sources ks on ks.id = b.knowledge_source_id
    left join knowledge_bit_cards kc on kc.knowledge_bit_id = b.id
    left join knowledge_bit_schedules s on s.knowledge_bit_id = b.id and s.card_key = coalesce(kc.card_key, '')
    join subjects sub on sub.id = case when b.topic_id is null then ks.subject_id else c.subject_id end
    where b.approval_state = 'approved'
    group by sub.id, sub.name
    order by sub.name
  `);

  return result.rows.map((row) => ({
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    totalCards: row.total,
    masteredCards: row.mastered,
  }));
}

export async function countSolidBySubject(
  window: TimeWindow,
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const result = await db.execute<{ subject_id: string; total: number }>(sql`
    select e.subject_id, count(distinct e.knowledge_bit_id)::int as total
    from review_point_events e
    join knowledge_bit_reviews r on r.id = e.review_id
    where e.voided_at is null
      and e.subject_id is not null
      and r.undone_at is null
      and r.reviewed_at >= ${iso(window.startsAt)}
      and r.reviewed_at < ${iso(window.endsAt)}
      and e.interval_days_after >= ${MASTERED_INTERVAL_DAYS}
      and coalesce((r.prev_schedule->>'intervalDays')::real, 0) < ${MASTERED_INTERVAL_DAYS}
    group by e.subject_id
  `);

  return new Map(result.rows.map((row) => [row.subject_id, row.total]));
}
