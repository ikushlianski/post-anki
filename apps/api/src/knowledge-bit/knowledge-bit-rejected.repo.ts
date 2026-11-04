import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RejectedCardsPage, RejectedCardsQuery } from "@post-anki/shared";
import { knowledgeBitFeedbackReasonSchema } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, curricula, knowledgeBits, knowledgeSources, topics } from "../db/schema.js";
import { browserSubjectScopeIds } from "./knowledge-bit-browser.repo.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";
import { knowledgeSourceTitleSql } from "./knowledge-source-title.sql.js";
import { releaseDecisionFeedback } from "./knowledge-bit-feedback-restore.repo.js";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function reasonOf(code: string | null) {
  const parsed = knowledgeBitFeedbackReasonSchema.safeParse(code ?? "unspecified");

  return parsed.success ? parsed.data : "unspecified";
}

export async function listRejectedKnowledgeBits(
  { reason, subjectId, q, limit, offset }: RejectedCardsQuery,
  db: DbExecutor = getDb(),
): Promise<RejectedCardsPage> {
  const latest = db
    .selectDistinctOn([cardTriageDecisions.knowledgeBitId], {
      knowledgeBitId: cardTriageDecisions.knowledgeBitId,
      reasonCode: cardTriageDecisions.reasonCode,
      decidedAt: cardTriageDecisions.decidedAt,
      note: cardTriageDecisions.note,
    })
    .from(cardTriageDecisions)
    .where(and(eq(cardTriageDecisions.verdict, "rejected"), sql`${cardTriageDecisions.undoneAt} is null`))
    .orderBy(cardTriageDecisions.knowledgeBitId, desc(cardTriageDecisions.decidedAt), desc(cardTriageDecisions.id))
    .as("latest_rejection");

  const reasonFilter =
    reason === undefined
      ? undefined
      : reason === "unspecified"
        ? sql`(${latest.reasonCode} is null or ${latest.reasonCode} = 'unspecified')`
        : eq(latest.reasonCode, reason);

  const textFilter =
    q === undefined ? undefined : sql`(${knowledgeBits.body} ilike ${`%${escapeLike(q)}%`} or ${latest.note} ilike ${`%${escapeLike(q)}%`})`;

  const subjectScopeIds = await browserSubjectScopeIds(subjectId, db);
  const subjectFilter = subjectScopeIds ? inArray(effectiveSubjectIdSql, subjectScopeIds) : undefined;

  const baseWhere = and(eq(knowledgeBits.approvalState, "rejected"), textFilter, subjectFilter);

  const countRows = db
    .select({ reasonCode: latest.reasonCode, total: sql<number>`count(*)::int` })
    .from(latest)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, latest.knowledgeBitId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(baseWhere)
    .groupBy(latest.reasonCode);

  const rowsQuery = db
    .select({
      knowledgeBitId: knowledgeBits.id,
      body: knowledgeBits.body,
      reasonCode: latest.reasonCode,
      decidedAt: latest.decidedAt,
      note: latest.note,
      origin: knowledgeBits.origin,
      sourceTitle: knowledgeSourceTitleSql,
      sourceUrl: knowledgeSources.sourceUrl,
    })
    .from(latest)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, latest.knowledgeBitId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(eq(knowledgeBits.approvalState, "rejected"), reasonFilter, textFilter, subjectFilter))
    .orderBy(desc(latest.decidedAt), desc(knowledgeBits.id))
    .limit(limit + 1)
    .offset(offset);

  const [rows, countGroups] = await Promise.all([rowsQuery, countRows]);

  const reasonCounts: Record<string, number> = {};

  for (const group of countGroups) {
    const key = reasonOf(group.reasonCode);

    reasonCounts[key] = (reasonCounts[key] ?? 0) + group.total;
  }

  return {
    items: rows.slice(0, limit).map((row) => ({
      knowledgeBitId: row.knowledgeBitId,
      body: row.body,
      reasonCode: reasonOf(row.reasonCode),
      decidedAt: row.decidedAt.toISOString(),
      note: row.note?.trim() ? row.note : null,
      sourceTitle: row.origin === "manual" ? null : (row.sourceTitle ?? null),
      sourceUrl: row.origin === "manual" ? null : (row.sourceUrl ?? null),
    })),
    hasMore: rows.length > limit,
    reasonCounts,
  };
}

export type RestoreRejectedResult = "ok" | "not_found" | "not_rejected";

export async function restoreRejectedOnly(id: string, db: DbExecutor = getDb()): Promise<RestoreRejectedResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ approvalState: knowledgeBits.approvalState })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, id))
      .for("update");

    if (!current) {
      return "not_found";
    }

    if (current.approvalState !== "rejected") {
      return "not_rejected";
    }

    await tx.update(knowledgeBits).set({ approvalState: "pending" }).where(eq(knowledgeBits.id, id));
    await releaseDecisionFeedback(tx, id, "rejected");

    const [latest] = await tx
      .select({ id: cardTriageDecisions.id })
      .from(cardTriageDecisions)
      .where(
        and(
          eq(cardTriageDecisions.knowledgeBitId, id),
          eq(cardTriageDecisions.verdict, "rejected"),
          isNull(cardTriageDecisions.undoneAt),
        ),
      )
      .orderBy(desc(cardTriageDecisions.decidedAt), desc(cardTriageDecisions.id))
      .limit(1);

    if (latest) {
      await tx.update(cardTriageDecisions).set({ undoneAt: new Date() }).where(eq(cardTriageDecisions.id, latest.id));
    }

    return "ok";
  });
}
