import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/client.js";
import { createStudyPlanTestDb } from "./study-plan-test-db.js";

const db = await createStudyPlanTestDb("study_plan_queue");

const { getKnowledgeBitReviewQueue } = await import("../knowledge-bit/knowledge-bit-review-queue.repo.js");
const { recordKnowledgeBitReview } = await import("../knowledge-bit/knowledge-bit-review.orchestrator.js");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const CLOCK = { tz: "UTC", now: NOW };
const DAY_MS = 86_400_000;

afterAll(() => db.dispose(closeDb));
beforeEach(() => db.reset());

async function setExam(subjectId: string, examDate: string, typedPerDay: number | null = null): Promise<void> {
  await db.client.query(
    `UPDATE subjects SET study_intent = 'exam', exam_date = $2, exam_planned_at = $3, new_cards_per_day = $4 WHERE id = $1`,
    [subjectId, examDate, NOW, typedPerDay],
  );
}

const newCardsOf = async (subjectId: string) =>
  (await getKnowledgeBitReviewQueue(500, undefined, CLOCK)).cards.filter(
    (card) => card.phase === "new" && card.subjectId === subjectId,
  );

describe("exam pacing in the review queue (real Postgres)", () => {
  it("should serve the paced number of new cards for an Exam subject and the stored limit for a Long-term one", async () => {
    const exam = await db.seedSubject();
    const longTerm = await db.seedSubject();

    await setExam(exam, "2090-03-16");
    await db.client.query(`UPDATE subjects SET new_cards_per_day = 3 WHERE id = $1`, [longTerm]);
    await db.seedBulk(exam, 60, null);
    await db.seedBulk(longTerm, 8, null);

    expect(await newCardsOf(exam)).toHaveLength(10);
    expect(await newCardsOf(longTerm)).toHaveLength(3);
  });

  it("should keep the paced number steady after new cards are graded today", async () => {
    const exam = await db.seedSubject();

    await setExam(exam, "2090-03-16");
    await db.seedBulk(exam, 60, null);

    const [first] = await newCardsOf(exam);
    await recordKnowledgeBitReview({ variantId: first!.variantId, grade: "again" }, NOW);

    expect((await getKnowledgeBitReviewQueue(500, undefined, CLOCK)).counts.new).toBe(9);
  });

  it("should serve no new cards for an Exam subject over its pause limit and serve them again below it", async () => {
    const exam = await db.seedSubject();
    const other = await db.seedSubject();
    const overdue = new Date(NOW.getTime() - DAY_MS);

    await setExam(exam, "2090-05-09", 1);
    await db.seedBulk(exam, 99, overdue);
    await db.seedBulk(exam, 5, null);
    await db.seedBulk(other, 4, null);

    expect(await newCardsOf(exam)).toHaveLength(1);

    await db.seedBulk(exam, 1, overdue);

    expect(await newCardsOf(exam)).toHaveLength(0);
    expect(await newCardsOf(other)).toHaveLength(4);
  });
});

describe("exam limits when grading (real Postgres)", () => {
  it("should schedule an Exam card no later than the day before the exam", async () => {
    const exam = await db.seedSubject();
    const { bitId, variantId } = await db.seedCard(exam);

    await setExam(exam, "2090-03-20");
    await db.seedSchedule(bitId, new Date(NOW.getTime() - DAY_MS), 30);

    const preview = (await getKnowledgeBitReviewQueue(10, undefined, CLOCK)).cards[0]?.intervalPreview;
    const result = await recordKnowledgeBitReview({ variantId, grade: "easy" }, NOW);

    expect(result.ok && result.intervalDays).toBe(9);
    expect(result.ok && new Date(result.dueAt).getTime()).toBe(NOW.getTime() + 9 * DAY_MS);
    expect(preview?.easy).toBe(9 * 86_400);
  });

  it("should schedule identical gaps to before for a default subject", async () => {
    const subject = await db.seedSubject();
    const { bitId, variantId } = await db.seedCard(subject);

    await db.seedSchedule(bitId, new Date(NOW.getTime() - DAY_MS), 30);

    const result = await recordKnowledgeBitReview({ variantId, grade: "easy" }, NOW);

    expect(result.ok && result.intervalDays).toBe(97.5);
  });

  it("should shorten a Good gap for a subject with a higher desired retention", async () => {
    const subject = await db.seedSubject();
    const { bitId, variantId } = await db.seedCard(subject);

    await db.client.query(`UPDATE subjects SET desired_retention = 0.95 WHERE id = $1`, [subject]);
    await db.seedSchedule(bitId, new Date(NOW.getTime() - DAY_MS), 20);

    const result = await recordKnowledgeBitReview({ variantId, grade: "good" }, NOW);

    expect(result.ok && result.intervalDays).toBe(25);
  });
});
