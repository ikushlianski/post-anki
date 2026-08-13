import { and, asc, count, eq } from "drizzle-orm";
import type { OpenQuestion, OpenQuestionSourceType, OpenQuestionStatus } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { openQuestions } from "../db/schema.js";
import { newId } from "../shared/id.js";

function rowToOpenQuestion(row: typeof openQuestions.$inferSelect): OpenQuestion {
  return {
    id: row.id,
    sourceType: row.sourceType as OpenQuestionSourceType,
    sourceItemId: row.sourceItemId,
    topicId: row.topicId,
    topicTitle: row.topicTitle,
    questionText: row.questionText,
    status: row.status as OpenQuestionStatus,
    answerText: row.answerText,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function insertOpenQuestion(input: {
  sourceType: OpenQuestionSourceType;
  sourceItemId: string;
  topicId: string | null;
  topicTitle: string | null;
  questionText: string;
}): Promise<OpenQuestion> {
  const db = getDb();
  const now = new Date();

  const row = {
    id: newId("oq"),
    sourceType: input.sourceType,
    sourceItemId: input.sourceItemId,
    topicId: input.topicId,
    topicTitle: input.topicTitle,
    questionText: input.questionText,
    status: "open" as const,
  };

  await db.insert(openQuestions).values(row);

  return rowToOpenQuestion({
    ...row,
    answerText: null,
    createdAt: now,
    resolvedAt: null,
  });
}

// Oldest-first (longest-unanswered surfaces first) — the review list
// (SCENARIO 3) and the /today banner (SCENARIO 5) share this exact
// ordering, matching the `(status, created_at)` index above.
export async function listOpenQuestions(
  status?: OpenQuestionStatus,
  limit?: number,
): Promise<OpenQuestion[]> {
  const db = getDb();
  const query = status
    ? db.select().from(openQuestions).where(eq(openQuestions.status, status))
    : db.select().from(openQuestions);

  const rows = await query.orderBy(asc(openQuestions.createdAt)).limit(limit ?? 1000);

  return rows.map(rowToOpenQuestion);
}

// A single indexed count, not a second row-fetch — feeds the banner
// deriver's `totalOpenCount` (see packages/core/src/open-questions), and the
// list route's totalCount for whatever filter (or lack of one) was applied.
export async function countOpenQuestions(status?: OpenQuestionStatus): Promise<number> {
  const query = status
    ? getDb().select({ value: count() }).from(openQuestions).where(eq(openQuestions.status, status))
    : getDb().select({ value: count() }).from(openQuestions);

  const rows = await query;

  return rows[0]?.value ?? 0;
}

export async function resolveOpenQuestion(
  id: string,
  status: "answered" | "dismissed",
  answerText: string | null,
): Promise<OpenQuestion | null> {
  const db = getDb();
  const existing = (
    await db.select().from(openQuestions).where(eq(openQuestions.id, id))
  )[0];

  if (!existing || existing.status !== "open") {
    return null;
  }

  const resolvedAt = new Date();

  await db
    .update(openQuestions)
    .set({
      status,
      answerText: status === "answered" ? answerText : null,
      resolvedAt,
    })
    .where(and(eq(openQuestions.id, id), eq(openQuestions.status, "open")));

  return rowToOpenQuestion({
    ...existing,
    status,
    answerText: status === "answered" ? answerText : null,
    resolvedAt,
  });
}
